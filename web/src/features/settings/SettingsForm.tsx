import { Fragment, useState } from "react";
import { btnGhost, btnPrimary, ErrorNotice, Field, inputClass, Notice, SectionTitle } from "../../components/ui";
import { type Settings, type SettingsPatch } from "core/api/types";
import { minuteToTimeInput, timeInputToMinute } from "core/domain/time-input";

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

/** 見出し+中身のまとまり。面は作らず、見出しの罫線で区切る */
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
	<section className="flex flex-col gap-2">
		<SectionTitle>{title}</SectionTitle>
		{children}
	</section>
);

/** 左に説明、右に短い入力の1行 */
const ValueRow = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
	// biome-ignore lint/a11y/noLabelWithoutControl: children に input を渡して包む
	<label className="flex items-center justify-between gap-3">
		<span className="flex min-w-0 flex-col">
			{label}
			{hint && <span className="text-xs text-faint">{hint}</span>}
		</span>
		<span className="w-20 shrink-0">{children}</span>
	</label>
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
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<Group title="睡眠">
				<div className="grid grid-cols-2 gap-2">
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
				<p className="text-xs text-faint">
					{crossesMidnight ? "日をまたぐ睡眠です。" : ""}この時間は作業時間に入れません(徹夜を防ぎます)
				</p>
			</Group>

			<Group title="通知">
				<div className="grid grid-cols-2 gap-2">
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
				<ValueRow label="1日の通知の上限(件)" hint="致命的なもの以外の個別通知の上限">
					<input
						type="number"
						inputMode="numeric"
						min={0}
						max={100}
						value={form.dailyLimit}
						onChange={(e) => set("dailyLimit", e.target.value)}
						className={`${inputClass} text-right`}
					/>
				</ValueRow>
				<label className="flex items-start gap-2">
					<input
						type="checkbox"
						checked={form.criticalDuringSleep}
						onChange={(e) => set("criticalDuringSleep", e.target.checked)}
						className="mt-0.5 size-4 shrink-0 accent-ink"
					/>
					<span className="flex flex-col">
						寝ている間も致命的な通知を送る
						<span className="text-xs text-faint">オフなら起きた時刻に送る(締切に近すぎるときは寝る前)</span>
					</span>
				</label>
			</Group>

			<Group title="普段の作業時間(1日)">
				<div className="grid grid-cols-2 gap-2">
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
				<p className="text-xs text-faint">実績がたまるまでの初期値です</p>
			</Group>

			<Group title="時限の時刻">
				{form.periods.length === 0 && (
					<p className="text-xs text-faint">未登録です。時間割で「N限」から選べるようになります</p>
				)}
				{form.periods.length > 0 && (
					<div className="grid grid-cols-[3.5rem_1fr_1fr_2rem] items-center gap-x-2 gap-y-1.5">
						<span className="text-xs text-sub">時限</span>
						<span className="text-xs text-sub">開始</span>
						<span className="text-xs text-sub">終了</span>
						<span aria-hidden="true" />
						{form.periods.map((p) => (
							<Fragment key={p.key}>
								<input
									type="number"
									inputMode="numeric"
									min={1}
									max={20}
									aria-label="時限"
									value={p.period}
									onChange={(e) => setPeriod(p.key, { period: e.target.value })}
									className={inputClass}
								/>
								<input
									type="time"
									aria-label="開始"
									value={p.start}
									onChange={(e) => setPeriod(p.key, { start: e.target.value })}
									className={inputClass}
								/>
								<input
									type="time"
									aria-label="終了"
									value={p.end}
									onChange={(e) => setPeriod(p.key, { end: e.target.value })}
									className={inputClass}
								/>
								<button
									type="button"
									aria-label={`${p.period}限を削除`}
									onClick={() =>
										set(
											"periods",
											form.periods.filter((x) => x.key !== p.key),
										)
									}
									className="rounded-sm py-1 text-sm text-sub active:bg-wash"
								>
									✕
								</button>
							</Fragment>
						))}
					</div>
				)}
				<button type="button" onClick={addPeriod} className={`${btnGhost} self-start`}>
					＋ 時限を追加
				</button>
			</Group>

			{(localError || error) && <ErrorNotice>{localError ?? `保存できませんでした: ${error}`}</ErrorNotice>}
			{saved && !saving && (
				<Notice>
					<output>保存しました</output>
				</Notice>
			)}
			<button type="submit" disabled={saving} className={btnPrimary}>
				{saving ? "保存中…" : "設定を保存"}
			</button>
		</form>
	);
}
