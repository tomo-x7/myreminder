// タスクの編集フォーム。日時は epoch ms か null で持つ(datetime-local の文字列との変換は画面の層)
import { useState } from "react";
import type { Task, TaskPatch } from "../api/types";
import type { Category } from "../domain/draft-types";
import { errorText } from "../domain/errors";
import type { TaskStatus } from "../domain/task-status";
import { useDeleteTask, useUpdateTask } from "../queries/tasks";
import { floorToMinute, isValid, type Problems } from "./common";

export const NOTE_MAX = 2000;

export type TaskForm = {
	title: string;
	/** null=科目なし */
	courseId: string | null;
	category: Category;
	dueAt: number | null;
	releaseAt: number | null;
	plannedStartAt: number | null;
	estimateMin: string;
	minBlockMin: string;
	firstStep: string;
	note: string;
	status: TaskStatus;
};

export type TaskFormProblems = Problems<"title" | "dueAt" | "estimateMin" | "minBlockMin">;

const optMinute = (ms: number | null) => (ms === null ? null : floorToMinute(ms));

export const taskToForm = (t: Task): TaskForm => ({
	title: t.title,
	courseId: t.courseId,
	category: t.category,
	dueAt: floorToMinute(t.dueAt),
	releaseAt: optMinute(t.releaseAt),
	plannedStartAt: optMinute(t.plannedStartAt),
	estimateMin: String(t.estimateMin),
	minBlockMin: String(t.minBlockMin),
	firstStep: t.firstStep ?? "",
	note: t.note ?? "",
	status: t.status,
});

const isPositiveInt = (s: string) => Number.isInteger(Number(s)) && Number(s) >= 1;

export function validateTaskForm(f: TaskForm): TaskFormProblems {
	const problems: TaskFormProblems = {};
	if (!f.title.trim()) problems.title = "タイトルが未入力";
	if (f.dueAt === null) problems.dueAt = "締切が未入力";
	if (!isPositiveInt(f.estimateMin)) problems.estimateMin = "1以上の整数";
	if (!isPositiveInt(f.minBlockMin)) problems.minBlockMin = "1以上の整数";
	return problems;
}

/** 検証済みの入力 → 更新内容。validateTaskForm が通ったものだけ渡す */
export function toTaskPatch(f: TaskForm, task: Task): TaskPatch {
	const estimateMin = Number(f.estimateMin);
	return {
		title: f.title.trim(),
		courseId: f.courseId,
		category: f.category,
		dueAt: f.dueAt as number,
		releaseAt: f.releaseAt,
		plannedStartAt: f.plannedStartAt,
		estimateMin,
		// 本人が見積もりを直したら手入力扱いにする
		...(estimateMin !== task.estimateMin ? { estimateSource: "manual" as const } : {}),
		minBlockMin: Number(f.minBlockMin),
		firstStep: f.firstStep.trim() || null,
		note: f.note.trim() || null,
		status: f.status,
	};
}

/** 状態の補足。完了は提出するまで終わりではないので、未提出と示す */
export const statusNotice = (status: TaskStatus): string | null => (status === "done" ? "未提出" : null);

/** 全項目の編集フォームの状態。submit は検証を通ったときだけ onSave を呼ぶ */
export function useTaskForm(task: Task) {
	const [form, setForm] = useState<TaskForm>(() => taskToForm(task));
	const [problems, setProblems] = useState<TaskFormProblems>({});
	const set = <K extends keyof TaskForm>(key: K, value: TaskForm[K]) => setForm((f) => ({ ...f, [key]: value }));

	function submit(onSave: (patch: TaskPatch) => void) {
		const found = validateTaskForm(form);
		setProblems(found);
		if (isValid(found)) onSave(toTaskPatch(form, task));
	}

	return { form, set, problems, notice: statusNotice(form.status), submit };
}

/** 詳細画面の保存と削除。保存したあとの「保存済み」の表示もここで持つ */
export function useTaskEditor(taskId: string) {
	const update = useUpdateTask();
	const remove = useDeleteTask();
	const [saved, setSaved] = useState(false);

	return {
		saving: update.isPending,
		saveError: update.isError ? errorText(update.error) : null,
		saved: saved && !update.isPending,
		save(patch: TaskPatch) {
			setSaved(false);
			update.mutate({ id: taskId, patch }, { onSuccess: () => setSaved(true) });
		},
		removing: remove.isPending,
		removeError: remove.isError ? errorText(remove.error) : null,
		remove(onDone: () => void) {
			remove.mutate(taskId, { onSuccess: onDone });
		},
	};
}
