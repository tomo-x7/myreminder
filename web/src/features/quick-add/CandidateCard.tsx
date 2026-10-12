import type { StartSuggestion } from "core/api/types";
import {
	type CourseOption,
	type DraftPatch,
	type DraftProblems,
	FIRST_STEP_MAX,
	resolveCourseId,
	selectableStarts,
	TITLE_MAX,
	toggleStart,
} from "core/domain/draft";
import { CATEGORY_OPTIONS, type Category, type Draft } from "core/domain/draft-types";
import { DatetimeInput } from "../../components/DateTimeInputs";
import { DueLabel } from "../../components/DueLabel";
import { RepeatFields } from "../../components/RepeatFields";
import { btnGhost, chipClass, Field, inputClass, Notice } from "../../components/ui";

type Props = {
	draft: Draft;
	/** 保存を押したあとに true。未入力の欄にエラーを出す */
	showProblems: boolean;
	problems: DraftProblems;
	/** タイトルを締切・見積もりより上に出す(手入力のカード。確認画面は締切から確かめる) */
	titleFirst?: boolean;
	/** 繰り返しの欄を出さない(受信箱の追加。取り込み元が毎回別の課題として出すので重複する) */
	hideRepeat?: boolean;
	courses: readonly CourseOption[];
	startSuggestions: readonly StartSuggestion[];
	now: number;
	disabled?: boolean;
	onChange: (patch: DraftPatch) => void;
	onRemove?: () => void;
};

/** 締切を曜日+相対つきで大きく見せる。日付の取り違えを防ぐ要(plan.md §3.2) */
function DuePreview({ dueAt, now, error }: { dueAt: number | null; now: number; error?: string }) {
	if (dueAt === null) {
		// 入力前はエラーを見せない(保存しようとして初めて error が来る)
		return error ? <p className="text-base font-semibold text-danger">{error}</p> : null;
	}
	return <DueLabel dueAt={dueAt} now={now} size="lg" />;
}

export function CandidateCard({
	draft,
	showProblems,
	problems,
	titleFirst,
	hideRepeat,
	courses,
	startSuggestions,
	now,
	disabled,
	onChange,
	onRemove,
}: Props) {
	const courseKnown = resolveCourseId(draft, courses) !== null;
	const chips = selectableStarts(startSuggestions, now, draft.dueAt);
	const listId = `courses-${draft.key}`;
	const titleField = (
		<Field label="タイトル" error={showProblems ? problems.title : undefined}>
			<input
				type="text"
				value={draft.title}
				maxLength={TITLE_MAX}
				disabled={disabled}
				onChange={(e) => onChange({ title: e.target.value })}
				className={inputClass}
			/>
		</Field>
	);

	return (
		<section
			className={`flex flex-col gap-2 rounded-sm border p-2 ${draft.needsReview ? "border-warn" : "border-line"}`}
		>
			<header className="flex items-start justify-between gap-2">
				<div className="flex flex-col gap-0.5">
					<DuePreview dueAt={draft.dueAt} now={now} error={showProblems ? problems.due : undefined} />
					{draft.dueText && <p className="text-xs text-sub">AI の解釈: 「{draft.dueText}」</p>}
				</div>
				{onRemove && (
					<button
						type="button"
						onClick={onRemove}
						disabled={disabled}
						aria-label="このカードを削除"
						className={`${btnGhost} shrink-0`}
					>
						削除
					</button>
				)}
			</header>

			{draft.needsReview && (
				<Notice tone="warn">
					<p className="font-semibold">要確認</p>
					<ul className="list-inside list-disc">
						{draft.reviewReasons.map((r) => (
							<li key={r}>{r}</li>
						))}
					</ul>
				</Notice>
			)}

			{titleFirst && titleField}

			<div className="grid grid-cols-[1fr_6rem] gap-2">
				<Field label="締切">
					<DatetimeInput
						value={draft.dueAt}
						disabled={disabled}
						onChange={(dueAt) => onChange({ dueAt })}
						className={inputClass}
					/>
				</Field>
				<Field label="見積もり(分)" error={showProblems ? problems.estimate : undefined}>
					<input
						type="number"
						inputMode="numeric"
						min={1}
						value={draft.estimateMin}
						disabled={disabled}
						onChange={(e) => onChange({ estimateMin: e.target.value })}
						className={inputClass}
					/>
				</Field>
			</div>

			{!titleFirst && titleField}

			<div className="grid grid-cols-2 gap-2">
				<Field
					label="科目"
					hint={
						draft.courseName.trim() !== "" &&
						!courseKnown && <span className="text-warn">未登録(科目なしで保存)</span>
					}
				>
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
				</Field>
				<Field label="種類">
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
				</Field>
			</div>

			<Field label="最初の一歩" error={showProblems ? problems.firstStep : undefined}>
				<input
					type="text"
					value={draft.firstStep}
					maxLength={FIRST_STEP_MAX}
					disabled={disabled}
					onChange={(e) => onChange({ firstStep: e.target.value })}
					className={inputClass}
				/>
			</Field>

			{/* 候補が取れていない(読み込み前・失敗)ときは欄ごと出さない */}
			{startSuggestions.length > 0 && (
				<fieldset className="flex flex-col gap-1">
					<legend className="mb-1 text-xs text-sub">いつ始める?</legend>
					<div className="flex flex-wrap gap-1.5">
						{chips.map((s) => {
							const selected = draft.plannedStartAt === s.at;
							return (
								<button
									key={s.at}
									type="button"
									aria-pressed={selected}
									disabled={disabled}
									onClick={() =>
										onChange({ plannedStartAt: toggleStart(draft.plannedStartAt, s.at) })
									}
									className={`${chipClass(selected)} disabled:opacity-40`}
								>
									{s.label}
								</button>
							);
						})}
						{chips.length === 0 && <p className="text-xs text-faint">候補なし</p>}
					</div>
				</fieldset>
			)}

			{!hideRepeat && (
				<RepeatFields
					repeat={draft.repeat}
					dueAt={draft.dueAt}
					now={now}
					problems={showProblems ? problems : {}}
					disabled={disabled}
					onChange={(repeat) => onChange({ repeat })}
				/>
			)}
		</section>
	);
}
