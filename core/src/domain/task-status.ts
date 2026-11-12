import type { Task } from "../api/types";

export type TaskStatus = Task["status"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
	todo: "未着手",
	doing: "作業中",
	// submitted は既存データ・旧クライアントとの互換状態
	done: "完了",
	submitted: "完了",
	dismissed: "取り下げ",
};

export const STATUS_ORDER: readonly TaskStatus[] = ["todo", "doing", "done", "dismissed"];

/** まだやることが残っているもの */
export const isOpen = (t: Pick<Task, "status">) => t.status === "todo" || t.status === "doing";

/** 一覧の絞り込み。"open" は未着手+作業中 */
export type StatusFilter = "open" | "todo" | "doing" | "done" | "submitted" | "all";

export const FILTERS: readonly { value: StatusFilter; label: string }[] = [
	{ value: "open", label: "未完了" },
	{ value: "todo", label: "未着手" },
	{ value: "doing", label: "作業中" },
	{ value: "done", label: "完了" },
	{ value: "all", label: "全部" },
];

export function matchesFilter(t: Task, f: StatusFilter): boolean {
	if (f === "all") return true;
	if (f === "open") return isOpen(t);
	if (f === "done" || f === "submitted") return t.status === "done" || t.status === "submitted";
	return t.status === f;
}

export const isStatusFilter = (s: string | null): s is StatusFilter => FILTERS.some((f) => f.value === s);
