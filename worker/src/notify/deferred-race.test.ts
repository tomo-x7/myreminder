import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type LocalD1, NOW } from "../test-utils/sqlite-d1";
import { dispatchDueNotifications } from "./dispatch";
import * as fcm from "./fcm";

const opened: LocalD1[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	for (const local of opened.splice(0)) local.sqlite.close();
});

function fixture(count = 3) {
	const local = createTestDb();
	opened.push(local);
	local.sqlite.prepare("INSERT INTO push_tokens(token,created_at,last_seen_at) VALUES('device',?,?)").run(NOW, NOW);
	const insert = local.sqlite.prepare(
		"INSERT INTO notifications(id,kind,priority,scheduled_at,status,payload) VALUES(?,'inbox',0,?,'deferred',?)",
	);
	for (let i = 0; i < count; i++) insert.run(`source-${i}`, NOW - 60_000, JSON.stringify({ title: `通知${i}` }));
	// FCM の送信境界だけを mock し、設定判定・policy・D1 は実装を通す。
	const sent = vi.spyOn(fcm, "sendToToken").mockResolvedValue({ ok: true });
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("外部通信は禁止");
		}),
	);
	const env = {
		...local.env,
		FCM_SERVICE_ACCOUNT: JSON.stringify({
			project_id: "local",
			client_email: "local@example.invalid",
			private_key: "unused",
		}),
	};
	const dispatch = (now = NOW) => dispatchDueNotifications(env, now);
	return { local, sent, dispatch };
}

function rows(local: LocalD1) {
	return local.sqlite
		.prepare("SELECT id,status,payload FROM notifications ORDER BY id")
		.all()
		.map((r) => ({
			id: r.id as string,
			status: r.status as string,
			payload: JSON.parse(r.payload as string) as { title?: string; body?: string; mergedInto?: string },
		}));
}

function expectOneSummary(local: LocalD1, count: number) {
	const all = rows(local);
	const summaries = all.filter((r) => !r.id.startsWith("source-"));
	expect(summaries).toHaveLength(1);
	expect(summaries[0].status).toBe("sent");
	const sources = all.filter((r) => r.id.startsWith("source-"));
	expect(sources).toHaveLength(count);
	for (const source of sources) {
		expect(source.status).toBe("merged");
		expect(source.payload.mergedInto).toBe(summaries[0].id);
	}
	return summaries[0];
}

describe("保留解除まとめの競合（実SQLite）", () => {
	it("同じ複数deferredを同時dispatchしてもまとめとFCM送信は1件だけ", async () => {
		const { local, sent, dispatch } = fixture();
		await Promise.all([dispatch(), dispatch()]);
		expect.soft(sent).toHaveBeenCalledTimes(1);
		expectOneSummary(local, 3);
	});

	it("先のbatchを止め、別dispatchがまとめを送った後に再開しても重複しない", async () => {
		const { local, sent, dispatch } = fixture();
		const paused = local.pauseNextBatch();
		const first = dispatch();
		await paused.entered;
		try {
			await dispatch();
			expectOneSummary(local, 3);
			expect(sent).toHaveBeenCalledTimes(1);
		} finally {
			paused.release();
		}
		await first;
		expectOneSummary(local, 3);
		expect(sent).toHaveBeenCalledTimes(1);
	});

	it.each(["skipped", "deleted"])(
		"batch前にsourceが%sになったら古いまとめを作らず次cronで残りを救済する",
		async (change) => {
			const { local, sent, dispatch } = fixture();
			const paused = local.pauseNextBatch();
			const first = dispatch();
			await paused.entered;
			try {
				if (change === "deleted") local.sqlite.prepare("DELETE FROM notifications WHERE id='source-0'").run();
				else local.sqlite.prepare("UPDATE notifications SET status='skipped' WHERE id='source-0'").run();
			} finally {
				paused.release();
			}
			await first;
			expect(sent).not.toHaveBeenCalled();
			expect(rows(local).filter((r) => !r.id.startsWith("source-"))).toEqual([]);
			for (const source of rows(local).filter((r) => r.id !== "source-0")) {
				expect(source.status).toBe("deferred");
				expect(source.payload.mergedInto).toBeUndefined();
			}
			await dispatch(NOW + 60_000);
			const all = rows(local);
			const summaries = all.filter((r) => !r.id.startsWith("source-"));
			expect(summaries).toHaveLength(1);
			expect(summaries[0]).toMatchObject({
				status: "sent",
				payload: { title: "保留 2件", body: "通知1\n通知2" },
			});
			for (const source of all.filter((r) => ["source-1", "source-2"].includes(r.id))) {
				expect(source.status).toBe("merged");
				expect(source.payload.mergedInto).toBe(summaries[0].id);
			}
			if (change === "skipped") expect(all.find((r) => r.id === "source-0")?.status).toBe("skipped");
			else expect(all.find((r) => r.id === "source-0")).toBeUndefined();
			expect(sent).toHaveBeenCalledTimes(1);
		},
	);

	it("126件の保留もD1の100bind制限内でまとめ、本文は5件とほか件数にする", async () => {
		const { local, sent, dispatch } = fixture(126);
		await dispatch();
		const summary = expectOneSummary(local, 126);
		expect(summary.payload).toMatchObject({
			title: "保留 126件",
			body: "通知0\n通知1\n通知2\n通知3\n通知4\nほか121件",
		});
		expect(sent).toHaveBeenCalledTimes(1);
	});

	it("summary挿入後のsource更新失敗はbatch全体をrollbackし次cronで回復する", async () => {
		const { local, sent, dispatch } = fixture();
		// summary が実際に挿入済みの時だけ失敗させ、SQLiteの実トランザクションでrollbackを確認する。
		local.sqlite.exec(`CREATE TRIGGER fail_source_merge BEFORE UPDATE ON notifications
			WHEN NEW.status = 'merged' AND EXISTS (SELECT 1 FROM notifications WHERE kind = 'digest')
			BEGIN SELECT RAISE(ABORT, 'injected source update failure'); END`);
		await expect(dispatch()).rejects.toThrow();
		expect(sent).not.toHaveBeenCalled();
		const remaining = rows(local);
		expect(remaining).toHaveLength(3);
		for (const source of remaining) {
			expect(source.id).toMatch(/^source-/);
			expect(source.status).toBe("deferred");
			expect(source.payload.mergedInto).toBeUndefined();
		}
		local.sqlite.exec("DROP TRIGGER fail_source_merge");
		await dispatch(NOW + 60_000);
		expectOneSummary(local, 3);
		expect(sent).toHaveBeenCalledTimes(1);
	});
});
