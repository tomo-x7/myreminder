import type { BusyBlock, BusyBlockInput } from "core/api/types";
import {
	type BusyKind,
	KIND_LABEL,
	KIND_ORDER,
	type Period,
	WEEKDAY_LABEL,
	WEEKDAY_ORDER,
} from "core/domain/timetable";
import { useBlockForm } from "core/forms/busy-block";
import { useState } from "react";
import { DateInput, DatetimeInput, TimeInput } from "../../components/DateTimeInputs";
import { btnDanger, btnPrimary, btnSecondary, chipClass, ErrorNotice, Field, inputClass } from "../../components/ui";

type Props = {
	/** 編集のとき。新規は undefined */
	block?: BusyBlock;
	defaultWeekday?: number;
	periods: readonly Period[];
	saving: boolean;
	error: string | null;
	onSave: (input: BusyBlockInput) => void;
	onDelete?: () => void;
};

/** 時間割(繰り返し)・単発の予定の追加/編集フォーム */
export function BlockForm({ block, defaultWeekday = 1, periods, saving, error, onSave, onDelete }: Props) {
	const { form, set, setShape, setStartAt, pickPeriod, isPeriodSelected, problem, submit } = useBlockForm(
		block,
		defaultWeekday,
	);
	const [confirming, setConfirming] = useState(false);
	const recurring = form.shape === "recurring";

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				submit(onSave);
			}}
		>
			<div className="flex gap-1.5" role="tablist" aria-label="種類">
				{(
					[
						["recurring", "毎週"],
						["oneoff", "単発"],
					] as const
				).map(([s, label]) => (
					<button
						key={s}
						type="button"
						role="tab"
						aria-selected={form.shape === s}
						onClick={() => setShape(s)}
						className={chipClass(form.shape === s)}
					>
						{label}
					</button>
				))}
			</div>

			<div className="grid grid-cols-[6.5rem_1fr] gap-2">
				<Field label="区分">
					<select
						value={form.kind}
						onChange={(e) => set("kind", e.target.value as BusyKind)}
						className={inputClass}
					>
						{KIND_ORDER.map((k) => (
							<option key={k} value={k}>
								{KIND_LABEL[k]}
							</option>
						))}
					</select>
				</Field>

				<Field label={form.kind === "class" ? "科目名" : "名前"}>
					<input
						type="text"
						value={form.label}
						maxLength={100}
						onChange={(e) => set("label", e.target.value)}
						className={inputClass}
					/>
				</Field>
			</div>

			{recurring ? (
				<>
					<Field label="曜日">
						<div className="flex gap-1">
							{WEEKDAY_ORDER.map((w) => (
								<button
									key={w}
									type="button"
									aria-pressed={form.weekday === w}
									onClick={() => set("weekday", w)}
									className={`${chipClass(form.weekday === w)} flex-1 text-center`}
								>
									{WEEKDAY_LABEL[w]}
								</button>
							))}
						</div>
					</Field>

					{form.kind === "class" && (
						<fieldset className="flex flex-col gap-1">
							<legend className="mb-1 text-xs text-sub">時限</legend>
							{periods.length === 0 ? (
								<p className="text-xs text-faint">未登録</p>
							) : (
								<div className="flex flex-wrap gap-1.5">
									{periods.map((p) => {
										const selected = isPeriodSelected(p);
										return (
											<button
												key={p.period}
												type="button"
												aria-pressed={selected}
												onClick={() => pickPeriod(p)}
												className={chipClass(selected)}
											>
												{p.period}限
											</button>
										);
									})}
								</div>
							)}
						</fieldset>
					)}

					<div className="grid grid-cols-2 gap-2">
						<Field label="開始">
							<TimeInput
								value={form.startMin}
								onChange={(v) => set("startMin", v)}
								className={inputClass}
							/>
						</Field>
						<Field label="終了">
							<TimeInput value={form.endMin} onChange={(v) => set("endMin", v)} className={inputClass} />
						</Field>
					</div>

					<div className="grid grid-cols-2 gap-2">
						<Field label="期間の開始">
							<DateInput
								value={form.dateFrom}
								onChange={(v) => set("dateFrom", v)}
								className={inputClass}
							/>
						</Field>
						<Field label="期間の終了(当日含む)">
							<DateInput value={form.dateTo} onChange={(v) => set("dateTo", v)} className={inputClass} />
						</Field>
					</div>
				</>
			) : (
				<>
					<Field label="開始">
						<DatetimeInput value={form.startAt} onChange={setStartAt} className={inputClass} />
					</Field>
					<Field label="終了">
						<DatetimeInput value={form.endAt} onChange={(v) => set("endAt", v)} className={inputClass} />
					</Field>
				</>
			)}

			{(problem || error) && <ErrorNotice>{problem ?? `保存失敗: ${error}`}</ErrorNotice>}
			<div className="flex gap-2">
				<button type="submit" disabled={saving} className={`${btnPrimary} flex-1`}>
					{saving ? "保存中…" : "保存"}
				</button>
				{onDelete && !confirming && (
					<button type="button" className={btnDanger} onClick={() => setConfirming(true)}>
						削除
					</button>
				)}
			</div>

			{onDelete && confirming && (
				<div className="grid grid-cols-2 gap-2">
					<button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>
						やめる
					</button>
					<button type="button" className={btnDanger} disabled={saving} onClick={onDelete}>
						削除
					</button>
				</div>
			)}
		</form>
	);
}
