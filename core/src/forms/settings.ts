// 設定のフォーム。時刻は JST 0時からの分で持つ(type=time の文字列との変換は画面の層)。
// 時間数・上限・時限の番号は打ったままの文字列で持つ
import { useState } from "react";
import type { Settings, SettingsPatch } from "../api/types";
import { errorText } from "../domain/errors";
import { useUpdateSettings } from "../queries/settings";
import { firstProblem, isValid, type Problems } from "./common";

/** 時限の1行。key は編集中の行の目印(番号は打ち替えられるので使えない) */
export type PeriodRow = { key: number; period: string; startMin: number | null; endMin: number | null };

export type SettingsForm = {
	sleepStartMin: number | null;
	sleepEndMin: number | null;
	morningMin: number | null;
	eveningMin: number | null;
	weekdayHours: string;
	holidayHours: string;
	dailyLimit: string;
	criticalDuringSleep: boolean;
	periods: PeriodRow[];
};

/** 検証の順に並べてある(画面は firstProblem で最初の1件を出す) */
export type SettingsFormProblems = Problems<"sleep" | "digest" | "capacity" | "dailyLimit" | "periods">;

/** 1日の終わり(24:00)は type=time で表せないので、これにそろえる */
const LAST_MINUTE = 1439;

const hoursText = (min: number) => String(min / 60);

export const settingsToForm = (s: Settings): SettingsForm => ({
	sleepStartMin: s.sleep.startMin,
	sleepEndMin: s.sleep.endMin,
	morningMin: s.digest.morningMin,
	eveningMin: s.digest.eveningMin,
	weekdayHours: hoursText(s.usualCapacityDefaults.weekday),
	holidayHours: hoursText(s.usualCapacityDefaults.holiday),
	dailyLimit: String(s.notificationDailyLimit),
	criticalDuringSleep: s.criticalDuringSleep,
	periods: s.timetablePeriods.map((p, i) => ({
		key: i,
		period: String(p.period),
		startMin: p.startMin,
		endMin: Math.min(p.endMin, LAST_MINUTE),
	})),
});

/** 睡眠が日をまたぐか(寝る時刻のほうが遅い) */
export const sleepCrossesMidnight = (f: Pick<SettingsForm, "sleepStartMin" | "sleepEndMin">) =>
	(f.sleepStartMin ?? 0) > (f.sleepEndMin ?? 0);

/** 時限を1行足す。番号は最後の次、開始は最後の終了 */
export function addPeriodRow(periods: readonly PeriodRow[]): PeriodRow[] {
	const last = periods.at(-1);
	return [
		...periods,
		{
			key: Math.max(-1, ...periods.map((p) => p.key)) + 1,
			period: String(last ? Number(last.period) + 1 : 1),
			startMin: last ? last.endMin : 9 * 60,
			endMin: 10 * 60 + 30,
		},
	];
}

const hoursToMin = (s: string) => Math.round(Number(s) * 60);
const validCapacity = (min: number, text: string) => text !== "" && Number.isFinite(min) && min >= 0 && min <= 1440;

export function validateSettingsForm(f: SettingsForm): SettingsFormProblems {
	const problems: SettingsFormProblems = {};
	if (f.sleepStartMin === null || f.sleepEndMin === null) problems.sleep = "睡眠の時刻が未入力";
	if (f.morningMin === null || f.eveningMin === null) problems.digest = "まとめの時刻が未入力";
	if (
		!validCapacity(hoursToMin(f.weekdayHours), f.weekdayHours) ||
		!validCapacity(hoursToMin(f.holidayHours), f.holidayHours)
	)
		problems.capacity = "作業時間は 0〜24h";

	const limit = Number(f.dailyLimit);
	if (f.dailyLimit === "" || !Number.isInteger(limit) || limit < 0 || limit > 100)
		problems.dailyLimit = "通知の上限は 0〜100";

	const periodProblem = validatePeriods(f.periods);
	if (periodProblem) problems.periods = periodProblem;
	return problems;
}

/** 最初に見つかった行の問題。なければ、番号の重複 */
function validatePeriods(rows: readonly PeriodRow[]): string | null {
	for (const row of rows) {
		const period = Number(row.period);
		if (!Number.isInteger(period) || period < 1 || period > 20) return "時限は 1〜20";
		if (row.startMin === null || row.endMin === null || row.endMin <= row.startMin)
			return `${period}限の終了が開始より前`;
	}
	if (new Set(rows.map((r) => Number(r.period))).size !== rows.length) return "時限が重複";
	return null;
}

/** 検証済みの入力 → 設定。validateSettingsForm が通ったものだけ渡す */
export function toSettingsPatch(f: SettingsForm): SettingsPatch {
	const minute = (v: number | null) => v as number;
	return {
		sleep: { startMin: minute(f.sleepStartMin), endMin: minute(f.sleepEndMin) },
		digest: { morningMin: minute(f.morningMin), eveningMin: minute(f.eveningMin) },
		usualCapacityDefaults: { weekday: hoursToMin(f.weekdayHours), holiday: hoursToMin(f.holidayHours) },
		notificationDailyLimit: Number(f.dailyLimit),
		criticalDuringSleep: f.criticalDuringSleep,
		timetablePeriods: f.periods
			.map((p) => ({ period: Number(p.period), startMin: minute(p.startMin), endMin: minute(p.endMin) }))
			.sort((a, b) => a.period - b.period),
	};
}

/** 設定フォームの状態。submit は検証を通ったときだけ onSave を呼ぶ */
export function useSettingsForm(settings: Settings) {
	const [form, setForm] = useState<SettingsForm>(() => settingsToForm(settings));
	const [problems, setProblems] = useState<SettingsFormProblems>({});
	const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
		setForm((f) => ({ ...f, [key]: value }));

	return {
		form,
		set,
		crossesMidnight: sleepCrossesMidnight(form),
		setPeriod: (key: number, patch: Partial<PeriodRow>) =>
			setForm((f) => ({ ...f, periods: f.periods.map((p) => (p.key === key ? { ...p, ...patch } : p)) })),
		addPeriod: () => setForm((f) => ({ ...f, periods: addPeriodRow(f.periods) })),
		removePeriod: (key: number) => setForm((f) => ({ ...f, periods: f.periods.filter((p) => p.key !== key) })),
		/** 検証に引っかかった最初の1件。なければ null */
		problem: firstProblem(problems),
		submit(onSave: (patch: SettingsPatch) => void) {
			const found = validateSettingsForm(form);
			setProblems(found);
			if (isValid(found)) onSave(toSettingsPatch(form));
		},
	};
}

/** 設定の保存と、「保存済み」の表示 */
export function useSaveSettings() {
	const update = useUpdateSettings();
	const [saved, setSaved] = useState(false);

	return {
		saving: update.isPending,
		error: update.isError ? errorText(update.error) : null,
		saved,
		save(patch: SettingsPatch) {
			setSaved(false);
			update.mutate(patch, { onSuccess: () => setSaved(true) });
		},
	};
}
