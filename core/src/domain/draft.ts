import type { ParsedCandidate, TaskCreate } from "../api/types";
import { fromDatetimeLocal, toDatetimeLocal } from "./date";
import type { Draft } from "./draft-types";

// React の key になるだけ。端末をまたがないので連番でよい(RN の Hermes には crypto.randomUUID がない)
let keySeq = 0;
const newKey = () => `draft-${++keySeq}`;

/** 手入力用の空のカード(解析に失敗したときの逃げ道。title には入力文を入れておく) */
export function emptyDraft(title = ""): Draft {
	return {
		key: newKey(),
		title,
		courseName: "",
		aiCourse: null,
		category: "other",
		dueLocal: "",
		estimateMin: "60",
		estimateTouched: false,
		firstStep: "",
		plannedStartAt: null,
		dueText: null,
		fromAi: false,
		needsReview: false,
		reviewReasons: [],
	};
}

export function candidateToDraft(c: ParsedCandidate): Draft {
	return {
		key: newKey(),
		title: c.title,
		courseName: c.courseName ?? "",
		aiCourse: c.courseId && c.courseName ? { id: c.courseId, name: c.courseName } : null,
		category: c.category ?? "other",
		dueLocal: c.dueAt === null ? "" : toDatetimeLocal(c.dueAt),
		estimateMin: String(c.estimateMin),
		estimateTouched: false,
		firstStep: c.firstStep ?? "",
		plannedStartAt: null,
		dueText: c.dueText,
		fromAi: true,
		needsReview: c.needsReview,
		reviewReasons: c.reviewReasons,
	};
}

export type CourseOption = { id: string; name: string; aliases: string[] };

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

/** 入力された科目名 → 科目 id。AI が結びつけた名前のままならそれを使い、変えたなら一覧から引き直す */
export function resolveCourseId(draft: Draft, courses: readonly CourseOption[]): string | null {
	const name = draft.courseName.trim();
	if (!name) return null;
	if (draft.aiCourse && draft.aiCourse.name === name) return draft.aiCourse.id;
	const key = norm(name);
	return courses.find((c) => [c.name, ...c.aliases].some((n) => norm(n) === key))?.id ?? null;
}

/** worker の taskCreateSchema の上限 */
export const TITLE_MAX = 200;
export const FIRST_STEP_MAX = 200;

/** 入力方法。line=1行、text=告知文の貼り付け */
export type ParseMode = "line" | "text";

/** 手入力カードの題。1行ならその行、告知文なら最初の空でない行(本文は確認画面に残す) */
export function draftTitle(mode: ParseMode, text: string): string {
	const line = mode === "line" ? text : (text.split("\n").find((l) => l.trim()) ?? "");
	return line.trim().slice(0, TITLE_MAX);
}

export type DraftProblems = { title?: string; due?: string; estimate?: string; firstStep?: string };

export function validateDraft(d: Draft): DraftProblems {
	const problems: DraftProblems = {};
	if (!d.title.trim()) problems.title = "タイトルを入力してください";
	else if (d.title.trim().length > TITLE_MAX) problems.title = `タイトルは${TITLE_MAX}文字以内にしてください`;
	if (d.firstStep.trim().length > FIRST_STEP_MAX) problems.firstStep = `${FIRST_STEP_MAX}文字以内にしてください`;
	if (fromDatetimeLocal(d.dueLocal) === null) problems.due = "締切を入力してください";
	const est = Number(d.estimateMin);
	if (!Number.isInteger(est) || est < 1) problems.estimate = "見積もりは1分以上の整数で入力してください";
	return problems;
}

export const hasProblems = (p: DraftProblems) => Object.keys(p).length > 0;

/** 検証済みのカード → 保存用の入力。validateDraft が通ったものだけ渡す */
export function draftToInput(d: Draft, courses: readonly CourseOption[]): TaskCreate {
	return {
		title: d.title.trim(),
		courseId: resolveCourseId(d, courses),
		category: d.category,
		dueAt: fromDatetimeLocal(d.dueLocal) as number,
		estimateMin: Number(d.estimateMin),
		estimateSource: d.fromAi && !d.estimateTouched ? "ai" : "manual",
		firstStep: d.firstStep.trim() || null,
		plannedStartAt: d.plannedStartAt,
	};
}
