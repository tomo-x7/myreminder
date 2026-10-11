// 受信箱の表示の規則。取り込み元の種類・状態の言い方と、紐付けの選択肢
import type { InboxCandidate, InboxChange, InboxItem } from "../api/types";
import { formatDue, formatJstDateTime } from "./date";
import { SOURCE_LABEL } from "./inbox-draft";

export const REASON_LABEL: Record<InboxCandidate["reason"], string> = {
	same_title: "同じタイトル",
	similar_title: "似たタイトル",
	near_due: "同科目で締切が近い",
};

const STATE_NOTE: Record<string, string> = {
	TURNED_IN: "提出済み",
	RETURNED: "返却済み",
};

/** `科目 ・ Classroom ・ 提出済み`(最後は取り込み元での状態) */
export function itemMeta(item: Pick<InboxItem, "courseName" | "source" | "remoteState">): string {
	const note = item.remoteState ? STATE_NOTE[item.remoteState] : undefined;
	return [item.courseName, SOURCE_LABEL[item.source] ?? item.source, note].filter(Boolean).join(" ・ ");
}

/** 変更の提案の見出し行 `科目 ・ Classroom` */
export function changeMeta(item: Pick<InboxChange, "courseName" | "source">): string {
	return [item.courseName, SOURCE_LABEL[item.source] ?? item.source].filter(Boolean).join(" ・ ");
}

/** 取り込み元へのリンクの文言 */
export const openSourceLabel = (source: string): string =>
	source === "classroom" ? "Classroom で開く" : "取り込み元で開く";

/** 重複の候補の補足 `10/14(水) 0:00 ・ 2日後 ・ 提出済み ・ 科目 ・ 同じタイトル` */
export function candidateMeta(c: InboxCandidate, now: number): string {
	return [formatDue(c.dueAt, now), c.status === "submitted" ? "提出済み" : null, c.courseName, REASON_LABEL[c.reason]]
		.filter(Boolean)
		.join(" ・ ");
}

/** 「ほかのタスクに紐付ける」の選択肢。取り下げと、すでに候補に出ているものは除き、締切の早い順 */
export function linkableTasks<T extends { id: string; status: string; dueAt: number }>(
	tasks: readonly T[],
	candidates: readonly Pick<InboxCandidate, "taskId">[],
): T[] {
	const candidateIds = new Set(candidates.map((c) => c.taskId));
	return tasks.filter((t) => t.status !== "dismissed" && !candidateIds.has(t.id)).sort((a, b) => a.dueAt - b.dueAt);
}

/** 選択肢の表示 `10/20(火) 23:59 課題3` */
export const taskOptionLabel = (t: { title: string; dueAt: number }): string =>
	`${formatJstDateTime(t.dueAt)} ${t.title}`;
