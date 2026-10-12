// タスクの編集フォーム。日時は epoch ms か null で持つ(datetime-local の文字列との変換は画面の層)
import { useState } from "react";
import type { Task, TaskPatch } from "../api/types";
import type { Category } from "../domain/draft-types";
import { errorText } from "../domain/errors";
import { seriesLine } from "../domain/recurrence";
import { emptyRepeat, patchRepeat, type RepeatDraft, repeatToInput, validateRepeat } from "../domain/repeat-draft";
import type { TaskStatus } from "../domain/task-status";
import { useRepeatTask, useSeries, useStopSeries } from "../queries/series";
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

/**
 * 編集画面の繰り返し。シリーズに属していれば何回目かの1行と「以降を止める」、
 * 属していなければ「繰り返す」(確認カードと同じ選択肢で、このタスクを最初の回にして設定する)
 */
export function useTaskSeries(task: Task) {
	const inSeries = task.seriesId !== null;
	const list = useSeries(inSeries);
	const stopSeries = useStopSeries();
	const repeatTask = useRepeatTask();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<RepeatDraft>(emptyRepeat);
	const [showProblems, setShowProblems] = useState(false);

	const series = inSeries ? list.data?.find((s) => s.id === task.seriesId) : undefined;
	const problems = validateRepeat(draft, task.dueAt);

	return {
		inSeries,
		/** `毎週 ・ 3回目 / 全15回`(止めたら末尾に `・ 止めた`)。シリーズを読み込むまでは null */
		line: series && task.seriesIndex !== null ? seriesLine(series, task.seriesIndex) : null,
		stopped: series !== undefined && series.stoppedAt !== null,
		/** 以降を止める。この回は残し、これより後の未着手の回を消す */
		stop: () => {
			if (series) stopSeries.mutate({ id: series.id, afterIndex: task.seriesIndex ?? undefined });
		},
		stopping: stopSeries.isPending,
		stopError: stopSeries.isError ? errorText(stopSeries.error) : null,
		// 繰り返しを付ける(シリーズに属していないとき)
		open,
		/** 開いたときは毎週を選んでおく(なしを選ぶなら閉じればよい) */
		show: () => {
			setDraft({ ...emptyRepeat(), freq: "weekly" });
			setShowProblems(false);
			repeatTask.reset();
			setOpen(true);
		},
		hide: () => setOpen(false),
		draft,
		patch: (patch: Partial<RepeatDraft>) => setDraft((r) => patchRepeat(r, patch)),
		problems: showProblems ? problems : {},
		/** 検証を通ったら設定する。できたら閉じる */
		submit: () => {
			const input = repeatToInput(draft);
			if (!input) return;
			setShowProblems(true);
			if (!isValid(problems)) return;
			repeatTask.mutate({ id: task.id, repeat: input }, { onSuccess: () => setOpen(false) });
		},
		canSubmit: draft.freq !== "none",
		setting: repeatTask.isPending,
		setError: repeatTask.isError ? errorText(repeatTask.error) : null,
	};
}
