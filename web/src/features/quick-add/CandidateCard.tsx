import { formatDueParts, formatJstDateTime, fromDatetimeLocal } from "../../lib/date";
import { type CourseOption, type DraftProblems, resolveCourseId } from "./draft";
import { CATEGORY_OPTIONS, type Category, type Draft, type StartSuggestion } from "./types";

type Props = {
	draft: Draft;
	/** 保存を押したあとに true。未入力の欄にエラーを出す */
	showProblems: boolean;
	problems: DraftProblems;
	courses: readonly CourseOption[];
	startSuggestions: readonly StartSuggestion[];
	now: number;
	disabled?: boolean;
	onChange: (patch: Partial<Draft>) => void;
	onRemove?: () => void;
};

const fieldLabel = "flex flex-col gap-1 text-sm font-medium text-gray-700";
const inputClass =
	"w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base font-normal text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100";

/** 締切を曜日+相対つきで大きく見せる。日付の取り違えを防ぐ要(plan.md §3.2) */
function DuePreview({ dueLocal, now, error }: { dueLocal: string; now: number; error?: string }) {
	const dueAt = fromDatetimeLocal(dueLocal);
	if (dueAt === null) {
		return (
			<p className={`text-lg font-bold ${error ? "text-red-600" : "text-gray-400"}`}>締切を入力してください</p>
		);
	}
	const { date, time, relative, week } = formatDueParts(dueAt, now);
	const overdue = dueAt < now;
	return (
		<p className={`flex flex-wrap items-baseline gap-x-2 ${overdue ? "text-red-600" : "text-gray-900"}`}>
			<span className="text-2xl font-bold tabular-nums">
				{date} {time}
			</span>
			<span className="text-base font-semibold">{relative}</span>
			{week && <span className="text-base font-semibold">{week}</span>}
		</p>
	);
}

export function CandidateCard({
	draft,
	showProblems,
	problems,
	courses,
	startSuggestions,
	now,
	disabled,
	onChange,
	onRemove,
}: Props) {
	const dueAt = fromDatetimeLocal(draft.dueLocal);
	const courseId = resolveCourseId(draft, courses);
	const courseKnown = courseId !== null;
	const chips = startSuggestions.filter((s) => s.at > now && (dueAt === null || s.at < dueAt));
	const listId = `courses-${draft.key}`;

	return (
		<section
			className={`flex flex-col gap-3 rounded-lg border p-3 ${
				draft.needsReview ? "border-amber-400 bg-amber-50" : "border-gray-300 bg-white"
			}`}
		>
			<header className="flex items-start justify-between gap-2">
				<div className="flex flex-col gap-1">
					<DuePreview dueLocal={draft.dueLocal} now={now} error={showProblems ? problems.due : undefined} />
					{draft.dueText && <p className="text-xs text-gray-600">AI の解釈: 「{draft.dueText}」</p>}
				</div>
				{onRemove && (
					<button
						type="button"
						onClick={onRemove}
						disabled={disabled}
						aria-label="このカードを削除"
						className="shrink-0 rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
					>
						削除
					</button>
				)}
			</header>

			{draft.needsReview && (
				<div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
					<p className="font-semibold">要確認</p>
					<ul className="list-inside list-disc">
						{draft.reviewReasons.map((r) => (
							<li key={r}>{r}</li>
						))}
					</ul>
				</div>
			)}

			<label className={fieldLabel}>
				締切(日本時間)
				<input
					type="datetime-local"
					value={draft.dueLocal}
					disabled={disabled}
					onChange={(e) => onChange({ dueLocal: e.target.value })}
					className={inputClass}
				/>
				{showProblems && problems.due && (
					<span className="text-xs font-normal text-red-600">{problems.due}</span>
				)}
			</label>

			<label className={fieldLabel}>
				タイトル
				<input
					type="text"
					value={draft.title}
					disabled={disabled}
					onChange={(e) => onChange({ title: e.target.value })}
					className={inputClass}
				/>
				{showProblems && problems.title && (
					<span className="text-xs font-normal text-red-600">{problems.title}</span>
				)}
			</label>

			<div className="grid grid-cols-2 gap-3">
				<label className={fieldLabel}>
					科目
					<input
						type="text"
						list={listId}
						value={draft.courseName}
						disabled={disabled}
						onChange={(e) => onChange({ courseName: e.target.value })}
						className={inputClass}
					/>
					<datalist id={listId}>
						{courses.map((c) => (
							<option key={c.id} value={c.name} />
						))}
					</datalist>
					{draft.courseName.trim() !== "" && (
						<span className={`text-xs font-normal ${courseKnown ? "text-green-700" : "text-amber-700"}`}>
							{courseKnown ? "登録済みの科目" : "未登録の科目(科目なしで保存)"}
						</span>
					)}
				</label>
				<label className={fieldLabel}>
					種類
					<select
						value={draft.category}
						disabled={disabled}
						onChange={(e) => onChange({ category: e.target.value as Category })}
						className={inputClass}
					>
						{CATEGORY_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</label>
			</div>

			<label className={fieldLabel}>
				見積もり(分)
				<input
					type="number"
					inputMode="numeric"
					min={1}
					step={5}
					value={draft.estimateMin}
					disabled={disabled}
					onChange={(e) => onChange({ estimateMin: e.target.value, estimateTouched: true })}
					className={inputClass}
				/>
				{showProblems && problems.estimate && (
					<span className="text-xs font-normal text-red-600">{problems.estimate}</span>
				)}
			</label>

			<label className={fieldLabel}>
				最初の一歩(任意)
				<input
					type="text"
					value={draft.firstStep}
					disabled={disabled}
					onChange={(e) => onChange({ firstStep: e.target.value })}
					placeholder="例: テンプレを開いて見出しだけ書く"
					className={inputClass}
				/>
			</label>

			<fieldset className="flex flex-col gap-2">
				<legend className="text-sm font-medium text-gray-700">いつ始める?</legend>
				<div className="flex flex-wrap gap-2">
					{chips.map((s) => {
						const selected = draft.plannedStartAt === s.at;
						return (
							<button
								key={s.at}
								type="button"
								aria-pressed={selected}
								disabled={disabled}
								onClick={() => onChange({ plannedStartAt: selected ? null : s.at })}
								className={`rounded-full border px-3 py-2 text-sm ${
									selected
										? "border-blue-600 bg-blue-600 text-white"
										: "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
								}`}
							>
								{s.label}
							</button>
						);
					})}
					{chips.length === 0 && <p className="text-xs text-gray-500">締切までに選べる候補がありません</p>}
				</div>
				<p className="text-xs text-gray-600">
					{draft.plannedStartAt === null
						? "決めない場合は、もう一度タップして解除"
						: `${formatJstDateTime(draft.plannedStartAt)} に合図します`}
				</p>
			</fieldset>
		</section>
	);
}
