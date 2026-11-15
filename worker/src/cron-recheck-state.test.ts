import { afterEach, expect, it, vi } from "vitest";
import { settings as settingsRoute } from "./routes/settings";
import { status as statusRoute } from "./routes/status";
import { closeWorkOnTask, getEffectiveStatus, setManualStatus, startWorking, stopWorking } from "./services/status";
import { createSettingsLoader, getSettings } from "./settings";
import { createTestDb, type LocalD1, NOW } from "./test-utils/sqlite-d1";

vi.mock("./notify/replan", () => ({ triggerReplan: vi.fn() }));
const opened: LocalD1[] = [];
const setup = () => {
	const local = createTestDb();
	opened.push(local);
	return local;
};
afterEach(() => {
	vi.restoreAllMocks();
	for (const local of opened.splice(0)) local.sqlite.close();
});

it("shares an asynchronous settings failure and retries once for the next consumers", async () => {
	const local = setup();
	const prepare = local.prepare.bind(local);
	let attempts = 0;
	vi.spyOn(local, "prepare").mockImplementation((query) => {
		const statement = prepare(query);
		if (query.includes('from "settings"')) {
			attempts++;
			if (attempts === 1)
				statement.raw = async () => {
					throw new Error("async DB failure");
				};
		}
		return statement;
	});
	const load = createSettingsLoader(local.db);
	const [a, b] = [load(), load()];
	expect(a).toBe(b);
	expect((await Promise.allSettled([a, b])).map((r) => r.status)).toEqual(["rejected", "rejected"]);
	const [c, d] = [load(), load()];
	expect(c).toBe(d);
	expect((await c).notificationDailyLimit).toBe(3);
	expect(attempts).toBe(2);
});

it("HTTP settings and status see writes after a cron-local settings snapshot", async () => {
	const local = setup();
	vi.spyOn(Date, "now").mockReturnValue(NOW);
	const load = createSettingsLoader(local.db);
	expect((await load()).notificationDailyLimit).toBe(3);
	const response = await settingsRoute.request(
		"http://local/",
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sleep: { startMin: 0, endMin: 1439 }, notificationDailyLimit: 8 }),
		},
		local.env,
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ notificationDailyLimit: 8 });
	expect(await (await settingsRoute.request("http://local/", {}, local.env)).json()).toMatchObject({
		notificationDailyLimit: 8,
	});
	expect(await (await statusRoute.request("http://local/", {}, local.env)).json()).toMatchObject({ mode: "sleep" });
	expect((await load()).notificationDailyLimit).toBe(3);
	expect((await createSettingsLoader(local.db)()).notificationDailyLimit).toBe(8);
});

it("all status writers work when reading status did not create a singleton", async () => {
	const local = setup();
	const db = local.db;
	await getEffectiveStatus(db, NOW);
	expect(local.sqlite.prepare("SELECT count(*) AS n FROM user_status").get()).toMatchObject({ n: 0 });
	await setManualStatus(db, "busy", NOW + 60_000);
	expect((await getEffectiveStatus(db, NOW)).mode).toBe("busy");
	local.sqlite.exec("DELETE FROM user_status");
	local.seedTask("t", "todo");
	expect((await startWorking(db, "t", NOW)).ok).toBe(true);
	expect((await getEffectiveStatus(db, NOW)).mode).toBe("working");
	local.sqlite.exec("DELETE FROM user_status");
	expect((await stopWorking(db, { progress: 20 }, NOW + 60_000)).ok).toBe(true);
	expect(local.sqlite.prepare("SELECT mode FROM user_status").get()).toMatchObject({ mode: "normal" });
	local.sqlite.exec("DELETE FROM user_status; UPDATE tasks SET status='done' WHERE id='t'");
	await db.batch([...closeWorkOnTask(db, "t", NOW + 120_000)]);
	expect((await getEffectiveStatus(db, NOW)).mode).toBe("normal");
});

it("filters unrelated invalid JSON while retaining every known settings key", async () => {
	const local = setup();
	local.sqlite.exec(
		"INSERT INTO settings(key,value) VALUES ('unrelated','not json'), ('notificationDailyLimit','17'), ('criticalDuringSleep','true'), ('usualCapacityDefaults','null')",
	);
	expect(await getSettings(local.db)).toMatchObject({
		notificationDailyLimit: 17,
		criticalDuringSleep: true,
		usualCapacityDefaults: { weekday: 180, holiday: 300 },
		timetablePeriods: [],
	});
});
