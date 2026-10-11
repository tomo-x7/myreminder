import type { Settings, SettingsPatch } from "core/api/types";
import { useSettingsForm } from "core/forms/settings";
import { Fragment } from "react";
import { TimeInput } from "../../components/DateTimeInputs";
import { btnGhost, btnPrimary, ErrorNotice, Field, inputClass, Notice, SectionTitle } from "../../components/ui";

type Props = {
	settings: Settings;
	saving: boolean;
	error: string | null;
	saved: boolean;
	onSave: (patch: SettingsPatch) => void;
};

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
	const { form, set, crossesMidnight, setPeriod, addPeriod, removePeriod, problem, submit } =
		useSettingsForm(settings);

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				submit(onSave);
			}}
		>
			<Group title="睡眠">
				<div className="grid grid-cols-2 gap-2">
					<Field label="寝る時刻">
						<TimeInput
							value={form.sleepStartMin}
							onChange={(v) => set("sleepStartMin", v)}
							className={inputClass}
						/>
					</Field>
					<Field label="起きる時刻">
						<TimeInput
							value={form.sleepEndMin}
							onChange={(v) => set("sleepEndMin", v)}
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
						<TimeInput
							value={form.morningMin}
							onChange={(v) => set("morningMin", v)}
							className={inputClass}
						/>
					</Field>
					<Field label="夜のまとめ">
						<TimeInput
							value={form.eveningMin}
							onChange={(v) => set("eveningMin", v)}
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
								<TimeInput
									aria-label="開始"
									value={p.startMin}
									onChange={(v) => setPeriod(p.key, { startMin: v })}
									className={inputClass}
								/>
								<TimeInput
									aria-label="終了"
									value={p.endMin}
									onChange={(v) => setPeriod(p.key, { endMin: v })}
									className={inputClass}
								/>
								<button
									type="button"
									aria-label={`${p.period}限を削除`}
									onClick={() => removePeriod(p.key)}
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

			{(problem || error) && <ErrorNotice>{problem ?? `保存できませんでした: ${error}`}</ErrorNotice>}
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
