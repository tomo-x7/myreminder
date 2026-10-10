import { useState } from "react";
import { btnPrimary, ErrorNotice, Field, inputClass, SectionTitle } from "../../components/ui";
import type { Settings, SettingsPatch } from "../../lib/queries";
import { minuteToTimeInput, timeInputToMinute } from "../../lib/time-input";

type Props = {
	settings: Settings;
	saving: boolean;
	error: string | null;
	saved: boolean;
	onSave: (patch: SettingsPatch) => void;
};

type PeriodRow = { key: number; period: string; start: string; end: string };

type Form = {
	sleepStart: string;
	sleepEnd: string;
	morning: string;
	evening: string;
	weekdayHours: string;
	holidayHours: string;
	dailyLimit: string;
	criticalDuringSleep: boolean;
	periods: PeriodRow[];
};

const hoursText = (min: number) => String(min / 60);

const toForm = (s: Settings): Form => ({
	sleepStart: minuteToTimeInput(s.sleep.startMin),
	sleepEnd: minuteToTimeInput(s.sleep.endMin),
	morning: minuteToTimeInput(s.digest.morningMin),
	evening: minuteToTimeInput(s.digest.eveningMin),
	weekdayHours: hoursText(s.usualCapacityDefaults.weekday),
	holidayHours: hoursText(s.usualCapacityDefaults.holiday),
	dailyLimit: String(s.notificationDailyLimit),
	criticalDuringSleep: s.criticalDuringSleep,
	periods: s.timetablePeriods.map((p, i) => ({
		key: i,
		period: String(p.period),
		start: minuteToTimeInput(p.startMin),
		end: minuteToTimeInput(Math.min(p.endMin, 1439)),
	})),
});

/** 入力 → 設定。1 か所でも不正ならエラー文を返す */
function toPatch(f: Form): { patch: SettingsPatch } | { error: string } {
	const sleepStart = timeInputToMinute(f.sleepStart);
	const sleepEnd = timeInputToMinute(f.sleepEnd);
	const morning = timeInputToMinute(f.morning);
	const evening = timeInputToMinute(f.evening);
	if (sleepStart === null || sleepEnd === null) return { error: "睡眠の時刻を入力してください" };
	if (morning === null || evening === null) return { error: "ダイジェストの時刻を入力してください" };

	const weekday = Math.round(Number(f.weekdayHours) * 60);
	const holiday = Math.round(Number(f.holidayHours) * 60);
	const validCap = (m: number) => Number.isFinite(m) && m >= 0 && m <= 1440;
	if (!validCap(weekday) || !validCap(holiday) || f.weekdayHours === "" || f.holidayHours === "")
		return { error: "作業時間は 0〜24 時間で入力してください" };

	const limit = Number(f.dailyLimit);
	if (f.dailyLimit === "" || !Number.isInteger(limit) || limit < 0 || limit > 100)
		return { error: "通知の上限は 0〜100 の整数で入力してください" };

	const periods: Settings["timetablePeriods"] = [];
	for (const row of f.periods) {
		const period = Number(row.period);
		const startMin = timeInputToMinute(row.start);
		const endMin = timeInputToMinute(row.end);
		if (!Number.isInteger(period) || period < 1 || period > 20)
			return { error: "時限は 1〜20 の整数で入力してください" };
		if (startMin === null || endMin === null || endMin <= startMin)
			return { error: `${period}限の終了は開始より後にしてください` };
		periods.push({ period, startMin, endMin });
	}
	if (new Set(periods.map((p) => p.period)).size !== periods.length) return { error: "同じ時限が重複しています" };
	periods.sort((a, b) => a.period - b.period);

	return {
		patch: {
			sleep: { startMin: sleepStart, endMin: sleepEnd },
			digest: { morningMin: morning, eveningMin: evening },
			usualCapacityDefaults: { weekday, holiday },
			notificationDailyLimit: limit,
			criticalDuringSleep: f.criticalDuringSleep,
			timetablePeriods: periods,
		},
	};
}

const Card = ({ children }: { children: React.ReactNode }) => (
	<section className="flex flex-col gap-3 rounded-lg border border-gray-300 bg-white p-4">{children}</section>
);

/** 睡眠・ダイジェスト・普段のキャパ・通知の上限・時限の編集。まとめて保存する */
export function SettingsForm({ settings, saving, error, saved, onSave }: Props) {
	const [form, setForm] = useState<Form>(() => toForm(settings));
	const [localError, setLocalError] = useState<string | null>(null);
	const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
	const setPeriod = (key: number, patch: Partial<PeriodRow>) =>
		set(
			"periods",
			form.periods.map((p) => (p.key === key ? { ...p, ...patch } : p)),
		);

	const crossesMidnight = (timeInputToMinute(form.sleepStart) ?? 0) > (timeInputToMinute(form.sleepEnd) ?? 0);

	function addPeriod() {
		const last = form.periods.at(-1);
		const nextNo = last ? Number(last.period) + 1 : 1;
		set("periods", [
			...form.periods,
			{
				key: Math.max(-1, ...form.periods.map((p) => p.key)) + 1,
				period: String(nextNo),
				start: last?.end ?? "09:00",
				end: "10:30",
			},
		]);
	}

	function submit() {
		const r = toPatch(form);
		if ("error" in r) {
			setLocalError(r.error);
			return;
		}
		setLocalError(null);
		onSave(r.patch);
	}

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<Card>
				<SectionTitle>睡眠</SectionTitle>
				<div className="grid grid-cols-2 gap-3">
					<Field label="寝る時刻">
						<input
							type="time"
							value={form.sleepStart}
							onChange={(e) => set("sleepStart", e.target.value)}
							className={inputClass}
						/>
					</Field>
					<Field label="起きる時刻">
						<input
							type="time"
							value={form.sleepEnd}
							onChange={(e) => set("sleepEnd", e.target.value)}
							className={inputClass}
						/>
					</Field>
				</div>
				<p className="text-xs text-gray-500">
					{crossesMidnight ? "日をまたぐ睡眠です。" : ""}この時間は作業時間に入れません(徹夜を防ぎます)
				</p>
			</Card>

			<Card>
				<SectionTitle>通知</SectionTitle>
				<div className="grid grid-cols-2 gap-3">
					<Field label="朝のまとめ">
						<input
							type="time"
							value={form.morning}
							onChange={(e) => set("morning", e.target.value)}
							className={inputClass}
						/>
					</Field>
					<Field label="夜のまとめ">
						<input
							type="time"
							value={form.evening}
							onChange={(e) => set("evening", e.target.value)}
							className={inputClass}
						/>
					</Field>
				</div>
				<Field label="1日の通知の上限(件)" hint="致命的なもの以外の個別通知の上限">
					<input
						type="number"
						inputMode="numeric"
						min={0}
						max={100}
						value={form.dailyLimit}
						onChange={(e) => set("dailyLimit", e.target.value)}
						className={inputClass}
					/>
				</Field>
				<label className="flex items-start gap-3 text-base text-gray-900">
					<input
						type="checkbox"
						checked={form.criticalDuringSleep}
						onChange={(e) => set("criticalDuringSleep", e.target.checked)}
						className="mt-1 h-5 w-5 shrink-0"
					/>
					<span>
						寝ている間も致命的な通知を送る
						<span className="block text-xs text-gray-500">
							オフなら起きた時刻に送る(締切に近すぎるときは寝る前)
						</span>
					</span>
				</label>
			</Card>

			<Card>
				<SectionTitle>普段の作業時間(1日)</SectionTitle>
				<div className="grid grid-cols-2 gap-3">
					<Field label="平日(時間)">
						<input
							type="number"
							inputMode="decimal"
							min={0}
							max={24}
							step={0.5}
							value={form.weekdayHours}
							onChange={(e) => set("weekdayHours", e.target.value)}
							className={inputClass}
						/>
					</Field>
					<Field label="休日(時間)">
						<input
							type="number"
							inputMode="decimal"
							min={0}
							max={24}
							step={0.5}
							value={form.holidayHours}
							onChange={(e) => set("holidayHours", e.target.value)}
							className={inputClass}
						/>
					</Field>
				</div>
				<p className="text-xs text-gray-500">実績がたまるまでの初期値です</p>
			</Card>

			<Card>
				<SectionTitle>時限の時刻</SectionTitle>
				{form.periods.length === 0 && (
					<p className="text-sm text-gray-500">未登録です。時間割で「N限」から選べるようになります</p>
				)}
				{form.periods.map((p) => (
					<div key={p.key} className="flex items-end gap-2">
						<Field label="時限">
							<input
								type="number"
								inputMode="numeric"
								min={1}
								max={20}
								value={p.period}
								onChange={(e) => setPeriod(p.key, { period: e.target.value })}
								className={`${inputClass} w-16`}
							/>
						</Field>
						<Field label="開始">
							<input
								type="time"
								value={p.start}
								onChange={(e) => setPeriod(p.key, { start: e.target.value })}
								className={inputClass}
							/>
						</Field>
						<Field label="終了">
							<input
								type="time"
								value={p.end}
								onChange={(e) => setPeriod(p.key, { end: e.target.value })}
								className={inputClass}
							/>
						</Field>
						<button
							type="button"
							aria-label={`${p.period}限を削除`}
							onClick={() =>
								set(
									"periods",
									form.periods.filter((x) => x.key !== p.key),
								)
							}
							className="mb-1 px-2 py-2 text-lg text-gray-500"
						>
							✕
						</button>
					</div>
				))}
				<button
					type="button"
					onClick={addPeriod}
					className="self-start px-1 py-1 text-sm font-bold text-blue-700"
				>
					＋ 時限を追加
				</button>
			</Card>

			{(localError || error) && <ErrorNotice>{localError ?? `保存できませんでした: ${error}`}</ErrorNotice>}
			{saved && !saving && (
				<output className="block rounded-md bg-green-100 px-3 py-2 text-sm text-green-800">保存しました</output>
			)}
			<button type="submit" disabled={saving} className={btnPrimary}>
				{saving ? "保存中…" : "設定を保存"}
			</button>
		</form>
	);
}
