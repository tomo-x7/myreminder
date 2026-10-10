// 受信箱の「重複の候補」(仕様: ai-docs/specs/ingest.md §2)。純粋関数だけ。
// 承認待ちのアイテムごとに、既存のタスクから同じ課題らしいものを最大3件探す
import { DAY } from "../planner/types";

export type CandidateReason = "same_title" | "similar_title" | "near_due";

export type CandidateItem = { title: string; courseName: string | null; dueAt: number | null };
export type CandidateTask = {
	id: string;
	title: string;
	dueAt: number;
	/** 科目名と別名。取り込み元の表記揺れに合わせる */
	courseNames: readonly string[];
};
export type Candidate = { taskId: string; reason: CandidateReason };

export const MAX_CANDIDATES = 3;
/** 「片方がもう片方を含む」で比べるときの、短いほうの最小の長さ */
const MIN_CONTAINED_LEN = 4;

/** NFKC → 小文字 → 空白・括弧・記号を除く */
export const normalizeTitle = (s: string): string =>
	s
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[\s\p{P}\p{S}]+/gu, "");

// 並び順: 同じタイトル → 含む → 締切が近い
const REASON_ORDER: Record<CandidateReason, number> = { same_title: 0, similar_title: 1, near_due: 2 };

export function findCandidates(item: CandidateItem, tasks: readonly CandidateTask[]): Candidate[] {
	const title = normalizeTitle(item.title);
	const course = item.courseName ? normalizeTitle(item.courseName) : "";
	const found: { taskId: string; reason: CandidateReason; diff: number }[] = [];

	for (const t of tasks) {
		const taskTitle = normalizeTitle(t.title);
		const sameCourse = course !== "" && t.courseNames.some((n) => normalizeTitle(n) === course);
		const diff = item.dueAt === null ? Number.POSITIVE_INFINITY : Math.abs(t.dueAt - item.dueAt);

		let reason: CandidateReason | null = null;
		if (title !== "" && title === taskTitle) reason = "same_title";
		else if (sameCourse && contains(title, taskTitle)) reason = "similar_title";
		else if (sameCourse && diff <= DAY) reason = "near_due";
		if (reason) found.push({ taskId: t.id, reason, diff });
	}

	// 同じ条件の中では締切の差が小さい順(sort は安定なので、同点は渡された順)
	found.sort((a, b) => REASON_ORDER[a.reason] - REASON_ORDER[b.reason] || a.diff - b.diff);
	return found.slice(0, MAX_CANDIDATES).map(({ taskId, reason }) => ({ taskId, reason }));
}

function contains(a: string, b: string): boolean {
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	return short.length >= MIN_CONTAINED_LEN && long.includes(short);
}
