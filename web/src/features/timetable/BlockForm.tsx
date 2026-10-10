import { useId, useState } from "react";
import { btnDanger, btnPrimary, btnSecondary, ErrorNotice, Field, inputClass } from "../../components/ui";
import { fromDatetimeLocal, toDatetimeLocal } from "../../lib/date";
import type { BusyBlock, BusyBlockInput, Course } from "../../lib/queries";
import { fromDateInput, minuteToTimeInput, timeInputToMinute, toDateInput } from "../../lib/time-input";
import {
	type BusyKind,
	isOneOff,
	isRecurring,
	KIND_LABEL,
	KIND_ORDER,
	type Period,
	WEEKDAY_LABEL,
	WEEKDAY_ORDER,
} from "./blocks";

type Props = {
	/** 編集のとき。新規は undefined */
	block?: BusyBlock;
	defaultWeekday?: number;
	periods: readonly Period[];
	courses: readonly Course[];
	saving: boolean;
	error: string | null;
	onSave: (input: BusyBlockInput) => void;
	onDelete?: () => void;
};

type Shape = "recurring" | "oneoff";

type Form = {
	shape: Shape;
	kind: BusyKind;
	label: string;
	weekday: string;
	start: string;
	end: string;
	dateFrom: string;
	dateTo: string;
	startLocal: string;
	endLocal: string;
};

function initialForm(block: BusyBlock | undefined, defaultWeekday: number): Form {
	const base: Form = {
		shape: "recurring",
		kind: "class",
		label: "",
		weekday: String(defaultWeekday),
		start: "09:00",
		end: "10:30",
		dateFrom: "",
		dateTo: "",
		startLocal: "",
		endLocal: "",
	};
	if (!block) return base;
	const common = { ...base, kind: block.kind, label: block.label };
	if (isRecurring(block)) {
		return {
			...common,
			weekday: String(block.weekday),
			start: minuteToTimeInput(block.startMin),
			end: minuteToTimeInput(Math.min(block.endMin, 1439)),
			dateFrom: block.dateFrom === null ? "" : toDateInput(block.dateFrom),
			dateTo: block.dateTo === null ? "" : toDateInput(block.dateTo),
		};
	}
	if (isOneOff(block)) {
		return {
			...common,
			shape: "oneoff",
			startLocal: toDatetimeLocal(block.startAt),
			endLocal: toDatetimeLocal(block.endAt),
		};
	}
	return common;
}

/** 入力 → 保存内容(繰り返し/単発のどちらか。使わない側は null で消す) */
function buildInput(f: Form): { input: BusyBlockInput } | { error: string } {
	const label = f.label.trim();
	if (f.shape === "recurring") {
		const startMin = timeInputToMinute(f.start);
		const endMin = timeInputToMinute(f.end);
		if (startMin === null || endMin === null) return { error: "開始と終了の時刻を入力してください" };
		if (endMin <= startMin) return { error: "終了は開始より後にしてください" };
		const dateFrom = fromDateInput(f.dateFrom);
		const dateTo = fromDateInput(f.dateTo);
		if (dateFrom !== null && dateTo !== null && dateTo < dateFrom)
			return { error: "期間の終わりが始まりより前です" };
		return {
			input: {
				kind: f.kind,
				label,
				weekday: Number(f.weekday),
				startMin,
				endMin,
				dateFrom,
				dateTo,
				startAt: null,
				endAt: null,
			},
		};
	}
	const startAt = fromDatetimeLocal(f.startLocal);
	const endAt = fromDatetimeLocal(f.endLocal);
	if (startAt === null || endAt === null) return { error: "開始と終了の日時を入力してください" };
	if (endAt <= startAt) return { error: "終了は開始より後にしてください" };
	return {
		input: {
			kind: f.kind,
			label,
			startAt,
			endAt,
			weekday: null,
			startMin: null,
			endMin: null,
			dateFrom: null,
			dateTo: null,
		},
	};
}

/** 時間割(繰り返し)・単発の予定の追加/編集フォーム */
export function BlockForm({ block, defaultWeekday = 1, periods, courses, saving, error, onSave, onDelete }: Props) {
	const [form, setForm] = useState<Form>(() => initialForm(block, defaultWeekday));
	const [localError, setLocalError] = useState<string | null>(null);
	const [confirming, setConfirming] = useState(false);
	const listId = useId();
	const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
	const recurring = form.shape === "recurring";

	function submit() {
		const r = buildInput(form);
		if ("error" in r) {
			setLocalError(r.error);
			return;
		}
		setLocalError(null);
		onSave(r.input);
	}

	const startMin = timeInputToMinute(form.start);
	const endMin = timeInputToMinute(form.end);

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<div className="flex gap-2" role="tablist" aria-label="種類">
				{(
					[
						["recurring", "毎週(時間割・バイト)"],
						["oneoff", "単発の予定"],
					] as const
				).map(([s, label]) => (
					<button
						key={s}
						type="button"
						role="tab"
						aria-selected={form.shape === s}
						onClick={() => {
							set("shape", s);
							if (s === "oneoff" && form.kind === "class") set("kind", "event");
						}}
						className={`rounded-full px-3 py-1.5 text-sm ${
							form.shape === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
						}`}
					>
						{label}
					</button>
				))}
			</div>

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
					list={listId}
					value={form.label}
					maxLength={100}
					onChange={(e) => set("label", e.target.value)}
					className={inputClass}
				/>
				{form.kind === "class" && (
					<datalist id={listId}>
						{courses.map((c) => (
							<option key={c.id} value={c.name} />
						))}
					</datalist>
				)}
			</Field>

			{recurring ? (
				<>
					<Field label="曜日">
						<div className="flex gap-1">
							{WEEKDAY_ORDER.map((w) => (
								<button
									key={w}
									type="button"
									aria-pressed={form.weekday === String(w)}
									onClick={() => set("weekday", String(w))}
									className={`flex-1 rounded-md py-2.5 text-base font-medium ${
										form.weekday === String(w)
											? "bg-blue-600 text-white"
											: "bg-white text-gray-800 ring-1 ring-gray-300"
									}`}
								>
									{WEEKDAY_LABEL[w]}
								</button>
							))}
						</div>
					</Field>

					{form.kind === "class" && (
						<fieldset className="flex flex-col gap-1">
							<legend className="mb-1 text-sm font-medium text-gray-700">時限から選ぶ</legend>
							{periods.length === 0 ? (
								<p className="text-xs text-gray-500">設定で時限の時刻を登録すると、ここから選べます</p>
							) : (
								<div className="flex flex-wrap gap-2">
									{periods.map((p) => {
										const selected = startMin === p.startMin && endMin === p.endMin;
										return (
											<button
												key={p.period}
												type="button"
												aria-pressed={selected}
												onClick={() => {
													set("start", minuteToTimeInput(p.startMin));
													set("end", minuteToTimeInput(Math.min(p.endMin, 1439)));
												}}
												className={`rounded-full border px-4 py-2 text-sm ${
													selected
														? "border-blue-600 bg-blue-600 text-white"
														: "border-gray-300 bg-white text-gray-800"
												}`}
											>
												{p.period}限
											</button>
										);
									})}
								</div>
							)}
						</fieldset>
					)}

					<div className="grid grid-cols-2 gap-3">
						<Field label="開始">
							<input
								type="time"
								value={form.start}
								onChange={(e) => set("start", e.target.value)}
								className={inputClass}
							/>
						</Field>
						<Field label="終了">
							<input
								type="time"
								value={form.end}
								onChange={(e) => set("end", e.target.value)}
								className={inputClass}
							/>
						</Field>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<Field label="期間の開始(任意)" hint="学期の始まり">
							<input
								type="date"
								value={form.dateFrom}
								onChange={(e) => set("dateFrom", e.target.value)}
								className={inputClass}
							/>
						</Field>
						<Field label="期間の終了(任意)" hint="学期の終わり(この日を含む)">
							<input
								type="date"
								value={form.dateTo}
								onChange={(e) => set("dateTo", e.target.value)}
								className={inputClass}
							/>
						</Field>
					</div>
				</>
			) : (
				<>
					<Field label="開始(日本時間)">
						<input
							type="datetime-local"
							value={form.startLocal}
							onChange={(e) => {
								set("startLocal", e.target.value);
								// 終了が空なら、同じ日の 1 時間後を入れておく
								if (!form.endLocal) {
									const s = fromDatetimeLocal(e.target.value);
									if (s !== null) set("endLocal", toDatetimeLocal(s + 3_600_000));
								}
							}}
							className={inputClass}
						/>
					</Field>
					<Field label="終了(日本時間)">
						<input
							type="datetime-local"
							value={form.endLocal}
							onChange={(e) => set("endLocal", e.target.value)}
							className={inputClass}
						/>
					</Field>
				</>
			)}

			{(localError || error) && <ErrorNotice>{localError ?? `保存できませんでした: ${error}`}</ErrorNotice>}
			<button type="submit" disabled={saving} className={btnPrimary}>
				{saving ? "保存中…" : "保存"}
			</button>

			{onDelete &&
				(confirming ? (
					<div className="grid grid-cols-2 gap-2">
						<button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>
							キャンセル
						</button>
						<button type="button" className={btnDanger} disabled={saving} onClick={onDelete}>
							削除する
						</button>
					</div>
				) : (
					<button
						type="button"
						className="self-start px-1 py-2 text-sm font-medium text-red-600"
						onClick={() => setConfirming(true)}
					>
						この予定を削除
					</button>
				))}
		</form>
	);
}
