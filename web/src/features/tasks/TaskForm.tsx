import type { Course, Task, TaskPatch } from "core/api/types";
import { TITLE_MAX } from "core/domain/draft";
import { taskTypeValue } from "core/domain/draft-types";
import { STATUS_LABEL, STATUS_ORDER, type TaskStatus } from "core/domain/task-status";
import { NOTE_MAX, useTaskForm } from "core/forms/task";
import { useEstimateReference } from "core/queries/estimates";
import { DatetimeInput } from "../../components/DateTimeInputs";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, ErrorNotice, Field, inputClass } from "../../components/ui";
import { CoursePicker } from "./CoursePicker";
import { EstimateHistory } from "./EstimateHistory";
import { TaskTypeSelect } from "./TaskTypeSelect";

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
	const { form, set, setType, problems, submit } = useTaskForm(task);
	const reference = useEstimateReference({
		category: form.category,
		courseId: form.courseId,
		seriesId: task.seriesId,
	});

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
					{STATUS_ORDER.filter((s) => form.taskKind !== "note" || s !== "doing").map((s) => (
						<option key={s} value={s}>
							{STATUS_LABEL[s]}
						</option>
					))}
				</select>
			</Field>

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
				<CoursePicker
					courses={courses}
					selectedId={form.courseId}
					disabled={saving}
					onSelect={(course) => set("courseId", course?.id ?? null)}
				/>
				<TaskTypeSelect value={taskTypeValue(form)} disabled={saving} onChange={setType} />
			</div>

			{form.taskKind !== "note" && (
				<>
					<div className="grid grid-cols-2 gap-2">
						<Field label="見積もり(分)" error={problems.estimateMin}>
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

					{reference.data && <EstimateHistory reference={reference.data} />}

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

					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={form.completionNotify}
							disabled={saving}
							onChange={(e) => set("completionNotify", e.target.checked)}
						/>
						完了を通知
					</label>
				</>
			)}

			<Field label="備考">
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
