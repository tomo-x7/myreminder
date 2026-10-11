// タスクの一覧の絞り込み・並べ方と、1行の表示用の値
import type { Course, Task } from "../api/types";
import { formatJstDateTime } from "./date";
import { isStatusFilter, matchesFilter, STATUS_LABEL, type StatusFilter } from "./task-status";
import { formatDuration } from "./time-input";

/** URL の `?s=` などの値 → 絞り込み。不明なら未完了 */
export const parseStatusFilter = (raw: string | null): StatusFilter => (isStatusFilter(raw) ? raw : "open");

/** 一覧に出す行。締切が早い順。提出済みだけ新しい順(直近のものが上) */
export function listTasks(tasks: readonly Task[], filter: StatusFilter): Task[] {
	const rows = tasks.filter((t) => matchesFilter(t, filter)).sort((a, b) => a.dueAt - b.dueAt);
	if (filter === "submitted") rows.reverse();
	return rows;
}

export const courseById = (courses: readonly Course[], id: string | null): Course | undefined =>
	courses.find((c) => c.id === id);

export type TaskRowView = {
	/** 完了したけど未提出。目立たせる */
	awaitingSubmit: boolean;
	/** 提出済み・取り下げ。控えめにする */
	finished: boolean;
	/** 未着手のときは出さない */
	statusLabel: string | null;
	/** finished のときの締切の言い方。それ以外は null(画面は相対表示つきの締切を出す) */
	closedDue: string | null;
	/** `科目名 ・ 1時間30分` */
	meta: string;
};

export function taskRowView(task: Task, course: Course | undefined): TaskRowView {
	const finished = task.status === "submitted" || task.status === "dismissed";
	return {
		awaitingSubmit: task.status === "done",
		finished,
		statusLabel: task.status === "todo" ? null : STATUS_LABEL[task.status],
		closedDue: finished ? `締切 ${formatJstDateTime(task.dueAt)}` : null,
		meta: [course?.name, formatDuration(task.estimateMin)].filter(Boolean).join(" ・ "),
	};
}
