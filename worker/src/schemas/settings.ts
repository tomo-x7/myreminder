// 設定の入力スキーマ。キーごとの値の形はここが正で、既定値は ../settings.ts
import * as v from "valibot";

const minuteOfDay = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1439));
const capacityMin = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1440));

export const settingValueSchemas = {
	// 睡眠時間帯(JST 0時からの分)。start > end なら日をまたぐ
	sleep: v.object({ startMin: minuteOfDay, endMin: minuteOfDay }),
	// 朝・夜のダイジェスト通知の時刻(JST 0時からの分)
	digest: v.object({ morningMin: minuteOfDay, eveningMin: minuteOfDay }),
	// 普段のキャパの初期値(分)。実績がたまるまで使う
	usualCapacityDefaults: v.object({ weekday: capacityMin, holiday: capacityMin }),
	// 1日に送る通知の上限
	notificationDailyLimit: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
	// 睡眠中でも致命の通知を送るか
	criticalDuringSleep: v.boolean(),
	// 時限ごとの開始・終了(JST 0時からの分)
	timetablePeriods: v.pipe(
		v.array(
			v.pipe(
				v.object({
					period: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
					startMin: minuteOfDay,
					endMin: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1440)),
				}),
				v.check((p) => p.endMin > p.startMin, "endMin must be greater than startMin"),
			),
		),
		v.maxLength(20),
	),
};

export const settingsUpdateSchema = v.partial(v.object(settingValueSchemas));
export type SettingsUpdateInput = v.InferInput<typeof settingsUpdateSchema>;
