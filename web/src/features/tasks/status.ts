import type { Task } from "../../lib/queries";

export type TaskStatus = Task["status"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
	todo: "未着手",
	doing: "作業中",
	// plan.md §3.1: done(作業完了)と submitted(提出済み)は別。完了しても提出するまでは終わりではない
	done: "完了(未提出)",
	submitted: "提出済み",
	dismissed: "取り下げ",
};

export const STATUS_ORDER: readonly TaskStatus[] = ["todo", "doing", "done", "submitted", "dismissed"];

/** まだやることが残っているもの */
export const isOpen = (t: Pick<Task, "status">) => t.status === "todo" || t.status === "doing";

/** 一覧の絞り込み。"open" は未着手+作業中 */
export type StatusFilter = "open" | "todo" | "doing" | "done" | "submitted" | "all";

export const FILTERS: readonly { value: StatusFilter; label: string }[] = [
	{ value: "open", label: "未完了" },
	{ value: "todo", label: "未着手" },
	{ value: "doing", label: "作業中" },
	{ value: "done", label: "完了(未提出)" },
	{ value: "submitted", label: "提出済み" },
	{ value: "all", label: "全部" },
];

export function matchesFilter(t: Task, f: StatusFilter): boolean {
	if (f === "all") return true;
	if (f === "open") return isOpen(t);
	return t.status === f;
}

export const isStatusFilter = (s: string | null): s is StatusFilter => FILTERS.some((f) => f.value === s);
