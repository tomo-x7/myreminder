import { afterEach, describe, expect, it, vi } from "vitest";
import { runScheduled } from "./cron";
import { dispatchDueNotifications } from "./notify/dispatch";
import { getEffectiveStatus } from "./services/status";
import { createSettingsLoader, getSettings, updateSettings } from "./settings";
import { createTestDb, type LocalD1, NOW } from "./test-utils/sqlite-d1";

vi.mock("./notify/fcm", async (original) => ({
	...(await original<typeof import("./notify/fcm")>()),
	isFcmConfigured: () => true,
	sendToToken: vi.fn(async () => {
		throw new Error("unexpected send");
	}),
}));
const opened: LocalD1[] = [];
const setup = () => {
	const local = createTestDb();
	opened.push(local);
	const queries: string[] = [];
	const prepare = local.prepare.bind(local);
	vi.spyOn(local, "prepare").mockImplementation((query) => {
		queries.push(query);
		return prepare(query);
	});
	return { local, queries };
};
afterEach(() => {
	vi.restoreAllMocks();
	for (const local of opened.splice(0)) local.sqlite.close();
});

describe("cronの不要な処理を省く", () => {
	it("作業・通知のない通常回は3回の読み取りだけで終わり、次の回では設定を再取得する", async () => {
		const { local, queries } = setup();
		const event = { scheduledTime: NOW + 60_000 } as ScheduledController;
		await runScheduled(event, local.env, {} as ExecutionContext);
		expect(queries).toHaveLength(3);
		expect(queries.every((query) => query.startsWith("select"))).toBe(true);
		await runScheduled(event, local.env, {} as ExecutionContext);
		expect(queries).toHaveLength(6);
	});
	it("未来のpendingだけなら宛先・設定・状態を読まず通知を残す", async () => {
		const { local, queries } = setup();
		local.sqlite
			.prepare(
				"INSERT INTO notifications(id,kind,scheduled_at,status,payload) VALUES('future','digest',?,'pending','{}')",
			)
			.run(NOW + 60_000);
		expect(await dispatchDueNotifications(local.env, NOW)).toEqual({ configured: true, notifications: [] });
		expect(queries).toHaveLength(1);
		expect(local.sqlite.prepare("SELECT status FROM notifications WHERE id='future'").get()).toMatchObject({
			status: "pending",
		});
	});
	it("状態が未保存でも通常として読み取り、行を作らない", async () => {
		const { local, queries } = setup();
		expect((await getEffectiveStatus(local.db, NOW)).mode).toBe("normal");
		expect(queries.every((query) => query.startsWith("select"))).toBe(true);
		expect(local.sqlite.prepare("SELECT count(*) AS n FROM user_status").get()).toMatchObject({ n: 0 });
	});
	it("設定に無関係な行をデコードせず、同じ実行内だけ取得結果を共有する", async () => {
		const { local, queries } = setup();
		local.sqlite.prepare("INSERT INTO settings(key,value) VALUES('fcm_access_token','not-json')").run();
		const db = local.db;
		const load = createSettingsLoader(db);
		const [a, b] = await Promise.all([load(), load()]);
		expect(a).toBe(b);
		expect(queries).toHaveLength(1);
		await updateSettings(db, { notificationDailyLimit: 9 });
		expect((await load()).notificationDailyLimit).toBe(3);
		expect((await createSettingsLoader(db)()).notificationDailyLimit).toBe(9);
	});
	it("一時的な設定取得失敗を後続ステップで再試行できる", async () => {
		const { local } = setup();
		const db = local.db;
		const original = db.select.bind(db);
		vi.spyOn(db, "select").mockImplementationOnce(() => {
			throw new Error("temporary");
		});
		const load = createSettingsLoader(db);
		await expect(load()).rejects.toThrow("temporary");
		vi.mocked(db.select).mockImplementation(original);
		expect(await load()).toEqual(await getSettings(db));
	});
});
