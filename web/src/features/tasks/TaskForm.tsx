import type { Course, Task, TaskPatch } from "core/api/types";
import { FIRST_STEP_MAX, TITLE_MAX } from "core/domain/draft";
import { CATEGORY_OPTIONS } from "core/domain/draft-types";
import { referenceText } from "core/domain/estimate-reference";
import { STATUS_LABEL, STATUS_ORDER, type TaskStatus } from "core/domain/task-status";
import { NOTE_MAX, useTaskForm } from "core/forms/task";
import { useEstimateReference } from "core/queries/estimates";
import { DatetimeInput } from "../../components/DateTimeInputs";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, ErrorNotice, Field, inputClass, Notice } from "../../components/ui";

type Props = {
	task: Task;
	courses: readonly Course[];
	now: number;
	saving: boolean;
	error: string | null;
	onSave: (patch: TaskPatch) => void;
};

/** タスクの全項目の編集フォーム */
export function TaskForm({ task, courses, now, saving, error, onSave }: Props) {
	const { form, set, problems, notice, submit } = useTaskForm(task);
	const courseName = courses.find((c) => c.id === form.courseId)?.name ?? null;
	const reference = useEstimateReference({
		category: form.category,
		courseId: form.courseId,
		seriesId: task.seriesId,
	});
	const refLine = reference.data ? referenceText(reference.data, { category: form.category, courseName }) : null;
	const estimateHint =
		[task.estimateSource === "ai" ? "AI の見積もり" : null, refLine].filter(Boolean).join(" ・ ") || undefined;

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				submit(onSave);
			}}
		>
			{form.dueAt !== null && <DueLabel dueAt={form.dueAt} now={now} size="lg" />}

			<Field label="状態">
				<select
					value={form.status}
					onChange={(e) => set("status", e.target.value as TaskStatus)}
					className={inputClass}
				>
					{STATUS_ORDER.map((s) => (
						<option key={s} value={s}>
							{STATUS_LABEL[s]}
						</option>
					))}
				</select>
			</Field>
			{notice && <Notice tone="warn">{notice}</Notice>}

			<Field label="タイトル" error={problems.title}>
				<input
					type="text"
					value={form.title}
					maxLength={TITLE_MAX}
					onChange={(e) => set("title", e.target.value)}
					className={inputClass}
				/>
			</Field>

			<Field label="締切" error={problems.dueAt}>
				<DatetimeInput value={form.dueAt} onChange={(v) => set("dueAt", v)} className={inputClass} />
			</Field>

			<div className="grid grid-cols-2 gap-2">
				<Field label="科目">
					<select
						value={form.courseId ?? ""}
						onChange={(e) => set("courseId", e.target.value || null)}
						className={inputClass}
					>
						<option value="">なし</option>
						{courses.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="種類">
					<select
						value={form.category}
						onChange={(e) => set("category", e.target.value as Task["category"])}
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

			<div className="grid grid-cols-2 gap-2">
				<Field label="見積もり(分)" error={problems.estimateMin} hint={estimateHint}>
					<input
						type="number"
						inputMode="numeric"
						min={1}
						value={form.estimateMin}
						onChange={(e) => set("estimateMin", e.target.value)}
						className={inputClass}
					/>
				</Field>
				<Field label="最小単位(分)" error={problems.minBlockMin}>
					<input
						type="number"
						inputMode="numeric"
						min={1}
						value={form.minBlockMin}
						onChange={(e) => set("minBlockMin", e.target.value)}
						className={inputClass}
					/>
				</Field>
			</div>

			<Field label="最初の一歩">
				<input
					type="text"
					value={form.firstStep}
					maxLength={FIRST_STEP_MAX}
					onChange={(e) => set("firstStep", e.target.value)}
					className={inputClass}
				/>
			</Field>

			<div className="grid grid-cols-2 gap-2">
				<Field label="着手時刻">
					<DatetimeInput
						value={form.plannedStartAt}
						onChange={(v) => set("plannedStartAt", v)}
						className={inputClass}
					/>
				</Field>

				<Field label="公開日時">
					<DatetimeInput
						value={form.releaseAt}
						onChange={(v) => set("releaseAt", v)}
						className={inputClass}
					/>
				</Field>
			</div>

			<Field label="メモ">
				<textarea
					rows={3}
					value={form.note}
					maxLength={NOTE_MAX}
					onChange={(e) => set("note", e.target.value)}
					className={inputClass}
				/>
			</Field>

			{error && <ErrorNotice>保存失敗: {error}</ErrorNotice>}
			<button type="submit" disabled={saving} className={`${btnPrimary} w-full`}>
				{saving ? "保存中…" : "保存"}
			</button>
		</form>
	);
}
