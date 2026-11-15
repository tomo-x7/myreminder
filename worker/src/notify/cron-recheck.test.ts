import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettingsLoader, updateSettings } from "../settings";
import { createTestDb, type LocalD1, NOW } from "../test-utils/sqlite-d1";
import { dispatchDueNotifications } from "./dispatch";
import { sendToToken } from "./fcm";

vi.mock("./fcm", async (original) => ({
	...(await original<typeof import("./fcm")>()),
	isFcmConfigured: () => true,
	sendToToken: vi.fn(async () => ({ ok: true })),
}));
const opened: LocalD1[] = [];
const setup = (token = true) => {
	const local = createTestDb();
	opened.push(local);
	if (token)
		local.sqlite
			.prepare("INSERT INTO push_tokens(token,platform,created_at,last_seen_at) VALUES ('local','web',?,?)")
			.run(NOW, NOW);
	return local;
};
const insert = (l: LocalD1, id: string, status = "pending", at = NOW, kind = "critical", payload = {}) =>
	l.sqlite
		.prepare("INSERT INTO notifications(id,kind,status,scheduled_at,payload) VALUES(?,?,?,?,?)")
		.run(id, kind, status, at, JSON.stringify(payload));
const status = (l: LocalD1, id: string) =>
	(l.sqlite.prepare("SELECT status FROM notifications WHERE id=?").get(id) as { status: string }).status;
beforeEach(() => vi.mocked(sendToToken).mockReset().mockResolvedValue({ ok: true }));
afterEach(() => {
	for (const local of opened.splice(0)) local.sqlite.close();
});
describe("通知dispatchの独立再検証", () => {
	it("予定時刻の1ms前は触らず、予定時刻ちょうどに送る", async () => {
		const l = setup();
		insert(l, "n");
		await dispatchDueNotifications(l.env, NOW - 1);
		expect(status(l, "n")).toBe("pending");
		expect(sendToToken).not.toHaveBeenCalled();
		await dispatchDueNotifications(l.env, NOW);
		expect(status(l, "n")).toBe("sent");
		expect(sendToToken).toHaveBeenCalledTimes(1);
	});
	it("deferredのみでも通常に戻れば解除して送る", async () => {
		const l = setup();
		insert(l, "n", "deferred", NOW - 60_000);
		await dispatchDueNotifications(l.env, NOW);
		expect(status(l, "n")).toBe("sent");
	});
	it("睡眠終了ちょうどにdeferredのみを解除する", async () => {
		const l = setup();
		const end = Date.parse("2026-11-12T08:00:00+09:00");
		insert(l, "n", "deferred", end - 60_000);
		await dispatchDueNotifications(l.env, end - 1);
		expect(status(l, "n")).toBe("deferred");
		await dispatchDueNotifications(l.env, end);
		expect(status(l, "n")).toBe("sent");
	});
	it("宛先なしは期日済みpendingだけ捨て、未来pendingとdeferredは残す", async () => {
		const l = setup(false);
		insert(l, "due");
		insert(l, "future", "pending", NOW + 1);
		insert(l, "held", "deferred");
		await dispatchDueNotifications(l.env, NOW);
		expect([status(l, "due"), status(l, "future"), status(l, "held")]).toEqual(["skipped", "pending", "deferred"]);
	});
	it("onlyIdsは睡眠と上限を迂回し、指定外は触らない", async () => {
		const l = setup();
		const now = Date.parse("2026-11-12T04:00:00+09:00");
		insert(l, "test", "pending", now, "risk");
		insert(l, "other", "pending", now);
		await dispatchDueNotifications(l.env, now, { onlyIds: ["test"] });
		expect(status(l, "test")).toBe("sent");
		expect(status(l, "other")).toBe("pending");
	});
	it("空のonlyIdsは全通知を送らない", async () => {
		const l = setup();
		insert(l, "n");
		await dispatchDueNotifications(l.env, NOW, { onlyIds: [] });
		expect(status(l, "n")).toBe("pending");
		expect(sendToToken).not.toHaveBeenCalled();
	});
	it("同時requestは同じpendingを一度だけ送る", async () => {
		const l = setup();
		insert(l, "n");
		await Promise.all([dispatchDueNotifications(l.env, NOW), dispatchDueNotifications(l.env, NOW)]);
		expect(sendToToken).toHaveBeenCalledTimes(1);
	});
	it("一時的な送信失敗を次の分で再送する", async () => {
		const l = setup();
		insert(l, "n");
		vi.mocked(sendToToken).mockResolvedValueOnce({
			ok: false,
			reason: "error",
			code: "UNAVAILABLE",
			status: 503,
			message: "temporary",
			transient: true,
			removed: false,
		});
		await dispatchDueNotifications(l.env, NOW);
		expect(status(l, "n")).toBe("pending");
		await dispatchDueNotifications(l.env, NOW + 60_000);
		expect(status(l, "n")).toBe("sent");
		expect(sendToToken).toHaveBeenCalledTimes(2);
	});
	it("共有設定は同一dispatch内で一度だけ読み、新しいrequestには設定変更が反映される", async () => {
		const l = setup();
		insert(l, "a", "pending", NOW, "risk");
		const load = vi.fn(createSettingsLoader(l.db));
		await dispatchDueNotifications(l.env, NOW, { db: l.db, loadSettings: load });
		expect(load).toHaveBeenCalledTimes(1);
		await updateSettings(l.db, { sleep: { startMin: 0, endMin: 1439 } });
		insert(l, "b", "pending", NOW, "risk");
		await dispatchDueNotifications(l.env, NOW);
		expect(status(l, "b")).toBe("deferred");
	});
});
