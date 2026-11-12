import { afterEach, describe, expect, it, vi } from "vitest";
import { HOUR } from "../planner/types";
import { createTestDb, type LocalD1 } from "../test-utils/sqlite-d1";
import { dispatchDueNotifications } from "./dispatch";
import { clearNoteReminders } from "./note-reminders";

// 実サービスのDB操作を通し、送信だけをローカルの成功へ置き換える。
vi.mock("./fcm", async (original) => ({
	...(await original<typeof import("./fcm")>()),
	isFcmConfigured: () => true,
	sendToToken: vi.fn(async () => ({ ok: true })),
}));

const NOW = Date.parse("2026-11-11T12:00:00+09:00");
const opened: LocalD1[] = [];
const setup = () => {
	const local = createTestDb();
	opened.push(local);
	local.seedTask("A", "todo", NOW);
	local.seedTask("B", "todo", NOW);
	local.sqlite.prepare("UPDATE tasks SET task_kind = 'note' WHERE id = 'A'").run();
	local.sqlite.prepare("UPDATE tasks SET due_at = ?").run(NOW + 24 * HOUR);
	local.sqlite
		.prepare("INSERT INTO push_tokens(token,platform,created_at,last_seen_at) VALUES ('local-token','web',?,?)")
		.run(NOW, NOW);
	return local;
};
const insert = (
	local: LocalD1,
	id: string,
	taskId: string | null,
	status: string,
	payload: Record<string, unknown>,
	kind = "risk",
	at = NOW - HOUR,
) => {
	local.sqlite
		.prepare("INSERT INTO notifications(id,task_id,kind,status,scheduled_at,payload) VALUES(?,?,?,?,?,?)")
		.run(id, taskId, kind, status, at, JSON.stringify(payload));
};
const row = (local: LocalD1, id: string) =>
	local.sqlite.prepare("SELECT status, payload FROM notifications WHERE id = ?").get(id) as
		| { status: string; payload: string }
		| undefined;

afterEach(() => {
	for (const local of opened.splice(0)) local.sqlite.close();
});

describe("メモへ変換したときの保存済みまとめ", () => {
	it.each(["pending", "deferred"])("未送信(%s)の上限まとめの他課題を次のdispatchへ残す", async (status) => {
		const local = setup();
		for (const id of ["A", "B"]) {
			insert(local, id, id, "merged", { title: id, capped: true, carriedAt: NOW, dedupeKey: `risk:${id}:0` });
		}
		insert(
			local,
			"combined",
			null,
			status,
			{ title: "まとめ 2件", body: "A\nB", cappedCarry: true },
			"digest",
			NOW,
		);
		await clearNoteReminders(local.db, "A");
		expect(row(local, "combined")).toBeUndefined();
		expect(row(local, "A")?.status).toBe("skipped");
		expect(row(local, "B")?.status).toBe("deferred");
		expect(JSON.parse(row(local, "B")!.payload)).not.toHaveProperty("carriedAt");
		await dispatchDueNotifications(local.env, NOW);
		expect(row(local, "B")?.status).toBe("sent");
	});

	it("日次上限に達したままでも、残した他課題を新しいまとめへ再構成する", async () => {
		const local = setup();
		for (let i = 0; i < 3; i++)
			insert(local, `sent${i}`, "B", "sent", { title: `前の通知${i}`, sentAt: NOW - HOUR });
		for (const id of ["A", "B"]) {
			insert(local, id, id, "merged", { title: id, capped: true, carriedAt: NOW });
		}
		insert(
			local,
			"combined",
			null,
			"pending",
			{ title: "まとめ 2件", body: "A\nB", cappedCarry: true },
			"digest",
			NOW,
		);
		await clearNoteReminders(local.db, "A");
		await dispatchDueNotifications(local.env, NOW);
		await dispatchDueNotifications(local.env, NOW + 60_000);
		const sent = local.sqlite
			.prepare("SELECT payload FROM notifications WHERE kind='digest' AND status='sent'")
			.all() as { payload: string }[];
		expect(sent).toHaveLength(1);
		expect(JSON.parse(sent[0].payload).body).toBe("B");
	});

	it("旧形式の上限まとめも保留解除で送信時刻が変わった後に他課題を復元する", async () => {
		const local = setup();
		for (const id of ["A", "B"])
			insert(local, id, id, "merged", { title: id, capped: true, carriedAt: NOW - HOUR });
		insert(local, "combined", null, "deferred", { title: "まとめ 2件", body: "A\nB", cappedCarry: true }, "digest");
		// 同じ実行の送信枠を使い切り、保留解除したまとめは次回へ残す。
		for (let i = 0; i < 30; i++) insert(local, `critical${i}`, "B", "pending", { title: `至急${i}` }, "critical");
		await dispatchDueNotifications(local.env, NOW);
		expect(row(local, "combined")?.status).toBe("pending");
		expect(JSON.parse(row(local, "combined")!.payload).cappedAt).toBe(NOW - HOUR);
		await clearNoteReminders(local.db, "A");
		expect(row(local, "combined")).toBeUndefined();
		expect(row(local, "B")?.status).toBe("deferred");
	});

	it("変換した課題と無関係な上限まとめは削除しない", async () => {
		const local = setup();
		insert(local, "B", "B", "merged", { title: "B", capped: true, carriedAt: NOW });
		insert(
			local,
			"combined",
			null,
			"pending",
			{ title: "まとめ 1件", body: "B", cappedCarry: true },
			"digest",
			NOW,
		);
		await clearNoteReminders(local.db, "A");
		expect(row(local, "combined")?.status).toBe("pending");
	});

	it.each(["sent", "skipped"])("配信が終了した(%s)保留まとめの他課題を再送しない", async (status) => {
		const local = setup();
		for (const id of ["A", "B"]) insert(local, id, id, "merged", { title: id, mergedInto: "summary" });
		insert(local, "summary", null, status, { title: "保留 2件", body: "A\nB", sentAt: NOW - HOUR }, "digest");
		await clearNoteReminders(local.db, "A");
		await dispatchDueNotifications(local.env, NOW);
		expect(row(local, "B")?.status).toBe("merged");
	});

	it("未送信の保留まとめだけ他課題を戻し、taskIdなしの元通知も保持する", async () => {
		const local = setup();
		insert(local, "A", "A", "merged", { title: "A", mergedInto: "summary" });
		insert(local, "B", "B", "merged", { title: "B", mergedInto: "summary" });
		insert(local, "inbox", null, "merged", { title: "受信箱", mergedInto: "summary" }, "inbox");
		insert(local, "summary", null, "pending", { title: "保留 3件", body: "A\nB\n受信箱" }, "digest");
		await clearNoteReminders(local.db, "A");
		expect(row(local, "B")?.status).toBe("deferred");
		expect(row(local, "inbox")?.status).toBe("deferred");
		expect(row(local, "summary")).toBeUndefined();
		await dispatchDueNotifications(local.env, NOW);
		const sent = local.sqlite.prepare("SELECT payload FROM notifications WHERE status='sent'").all() as {
			payload: string;
		}[];
		expect(sent).toHaveLength(1);
		expect(JSON.parse(sent[0].payload).body).toBe("B\n受信箱");
	});

	it("100件を超す集約履歴でも束縛上限を超えず未送信分だけを復元する", async () => {
		const local = setup();
		for (let i = 0; i < 125; i++) {
			insert(local, `a${i}`, "A", "merged", { mergedInto: `summary${i}` });
			insert(local, `b${i}`, "B", "merged", { title: "B", mergedInto: `summary${i}` });
			insert(local, `summary${i}`, null, i === 124 ? "pending" : "sent", { title: "保留" }, "digest");
		}
		await clearNoteReminders(local.db, "A");
		expect(row(local, "b124")?.status).toBe("deferred");
		expect(row(local, "b123")?.status).toBe("merged");
	});
});

describe("メモの送信時抑止", () => {
	it.each(["pending", "deferred"])("メモに残った締切変更と提出取消(%s)も送らない", async (status) => {
		const local = setup();
		insert(local, "due", "A", status, { title: "締切変更: A" }, "due_change");
		insert(local, "reclaimed", "A", status, { title: "提出取消: A" }, "inbox");
		insert(local, "work-due", "B", status, { title: "締切変更: B" }, "due_change");
		await dispatchDueNotifications(local.env, NOW);
		expect(row(local, "due")?.status).toBe("skipped");
		expect(row(local, "reclaimed")?.status).toBe("skipped");
		expect(row(local, "work-due")?.status).toBe("sent");
	});
});
