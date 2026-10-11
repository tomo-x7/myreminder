import type { Course, Task, TaskPatch } from "core/api/types";
import { FIRST_STEP_MAX, TITLE_MAX } from "core/domain/draft";
import { CATEGORY_OPTIONS } from "core/domain/draft-types";
import { STATUS_LABEL, STATUS_ORDER, type TaskStatus } from "core/domain/task-status";
import { NOTE_MAX, useTaskForm } from "core/forms/task";
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

			<Field label="締切(日本時間)" error={problems.dueAt}>
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
				<Field
					label="見積もり(分)"
					error={problems.estimateMin}
					hint={task.estimateSource === "ai" ? "AI の見積もり" : undefined}
				>
					<input
						type="number"
						inputMode="numeric"
						min={1}
						value={form.estimateMin}
						onChange={(e) => set("estimateMin", e.target.value)}
						className={inputClass}
					/>
				</Field>
				<Field label="最小の作業単位(分)" error={problems.minBlockMin}>
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

			<Field label="最初の一歩(任意)">
				<input
					type="text"
					value={form.firstStep}
					maxLength={FIRST_STEP_MAX}
					onChange={(e) => set("firstStep", e.target.value)}
					placeholder="例: テンプレを開いて見出しだけ書く"
					className={inputClass}
				/>
			</Field>

			<div className="grid grid-cols-2 gap-2">
				<Field label="着手する時刻(任意)" hint="決めた時刻に合図します">
					<DatetimeInput
						value={form.plannedStartAt}
						onChange={(v) => set("plannedStartAt", v)}
						className={inputClass}
					/>
				</Field>

				<Field label="公開日時(任意)" hint="これより前は着手できない課題のとき">
					<DatetimeInput
						value={form.releaseAt}
						onChange={(v) => set("releaseAt", v)}
						className={inputClass}
					/>
				</Field>
			</div>

			<Field label="メモ(任意)">
				<textarea
					rows={3}
					value={form.note}
					maxLength={NOTE_MAX}
					onChange={(e) => set("note", e.target.value)}
					className={inputClass}
				/>
			</Field>

			{error && <ErrorNotice>保存できませんでした: {error}</ErrorNotice>}
			<button type="submit" disabled={saving} className={`${btnPrimary} w-full`}>
				{saving ? "保存中…" : "保存"}
			</button>
		</form>
	);
}
