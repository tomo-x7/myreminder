// 設定(key/value の settings テーブル)。通知やプランナーはここから読む。
// 1キー1行・値は JSON。保存されていない/形が壊れているキーは既定値にフォールバックする
import { sql } from "drizzle-orm";
import * as v from "valibot";
import type { Db } from "./db";
import { settings } from "./db/schema";
import { type SettingsUpdateInput, settingValueSchemas } from "./schemas/settings";

export type Settings = {
	/** 睡眠時間帯。JST 0時からの分。start > end なら日をまたぐ */
	sleep: { startMin: number; endMin: number };
	/** 朝・夜ダイジェストの時刻。JST 0時からの分 */
	digest: { morningMin: number; eveningMin: number };
	/** 普段のキャパの初期値(分)。学習できるまでの代わり */
	usualCapacityDefaults: { weekday: number; holiday: number };
	/** 1日の通知の上限 */
	notificationDailyLimit: number;
	/** 睡眠中でも致命の通知を送る。既定は送らない(起きてから) */
	criticalDuringSleep: boolean;
	/** 時限の時刻表(JST 0時からの分)。未設定は空 */
	timetablePeriods: { period: number; startMin: number; endMin: number }[];
};

export const SETTINGS_DEFAULTS: Settings = {
	sleep: { startMin: 60, endMin: 480 },
	digest: { morningMin: 480, eveningMin: 1320 },
	usualCapacityDefaults: { weekday: 180, holiday: 300 },
	notificationDailyLimit: 3,
	criticalDuringSleep: false,
	timetablePeriods: [],
};

const KEYS = Object.keys(SETTINGS_DEFAULTS) as (keyof Settings)[];

/** 全設定を返す。未保存・不正な値は既定値 */
export async function getSettings(db: Db): Promise<Settings> {
	const rows = await db.select().from(settings);
	const stored = new Map(rows.map((r) => [r.key, r.value]));
	const result: Record<string, unknown> = {};
	for (const key of KEYS) {
		const parsed = v.safeParse(settingValueSchemas[key], stored.get(key));
		result[key] = parsed.success ? parsed.output : SETTINGS_DEFAULTS[key];
	}
	return result as Settings;
}

/** 渡したキーだけ上書き(値はキー単位で丸ごと置き換え)して、全設定を返す */
export async function updateSettings(db: Db, partial: SettingsUpdateInput): Promise<Settings> {
	const entries = KEYS.flatMap((key) => (partial[key] === undefined ? [] : [{ key, value: partial[key] }]));
	const [first, ...rest] = entries.map((e) =>
		db
			.insert(settings)
			.values(e)
			.onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } }),
	);
	if (first) await db.batch([first, ...rest]);
	return getSettings(db);
}
