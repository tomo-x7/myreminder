import type { ParsedCandidate, StartSuggestion, TaskCreate } from "../api/types";
import type { Draft } from "./draft-types";
import {
	emptyRepeat,
	patchRepeat,
	type RepeatDraft,
	type RepeatProblems,
	repeatFromCandidate,
	repeatToInput,
	validateRepeat,
} from "./repeat-draft";

// React の key になるだけ。端末をまたがないので連番でよい(RN の Hermes には crypto.randomUUID がない)
let keySeq = 0;
const newKey = () => `draft-${++keySeq}`;

/** 手入力用の空のカード(クイック追加の既定。解析に失敗したときの逃げ道にもなる。title には入力文を入れておく) */
export function emptyDraft(title = ""): Draft {
	return {
		key: newKey(),
		title,
		courseName: "",
		aiCourse: null,
		category: "other",
		taskKind: "work",
		completionNotify: true,
		dueAt: null,
		estimateMin: "60",
		estimateTouched: false,
		plannedStartAt: null,
		repeat: emptyRepeat(),
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
		taskKind: c.taskKind ?? "work",
		completionNotify: c.completionNotify ?? true,
		dueAt: c.dueAt,
		estimateMin: String(c.estimateMin),
		estimateTouched: false,
		plannedStartAt: null,
		repeat: repeatFromCandidate(c.repeat),
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

/** AI で解析する入力方法。line=1行、text=告知文の貼り付け */
export type ParseMode = "line" | "text";

/** クイック追加の入力方法。manual=手入力(既定)。写真は選んだ時点で解析に進むので、モードではない */
export type InputMode = "manual" | ParseMode;

/** 手入力カードの題。1行ならその行、告知文なら最初の空でない行(本文は確認画面に残す) */
export function draftTitle(mode: ParseMode, text: string): string {
	const line = mode === "line" ? text : (text.split("\n").find((l) => l.trim()) ?? "");
	return line.trim().slice(0, TITLE_MAX);
}

export type DraftProblems = RepeatProblems & { title?: string; due?: string; estimate?: string };

export function validateDraft(d: Draft): DraftProblems {
	const problems: DraftProblems = {};
	if (!d.title.trim()) problems.title = "タイトルが未入力";
	else if (d.title.trim().length > TITLE_MAX) problems.title = `${TITLE_MAX}字まで`;
	if (d.dueAt === null) problems.due = "締切が未入力";
	const est = Number(d.estimateMin);
	if (d.taskKind !== "note" && (!Number.isInteger(est) || est < 1)) problems.estimate = "1以上の整数";
	return { ...problems, ...validateRepeat(d.repeat, d.dueAt) };
}

export const hasProblems = (p: DraftProblems) => Object.keys(p).length > 0;

/** 検証済みのカード → 保存用の入力。validateDraft が通ったものだけ渡す */
export function draftToInput(d: Draft, courses: readonly CourseOption[]): TaskCreate {
	const repeat = repeatToInput(d.repeat);
	return {
		title: d.title.trim(),
		courseId: resolveCourseId(d, courses),
		category: d.category,
		taskKind: d.taskKind,
		completionNotify: d.taskKind === "note" ? false : d.completionNotify,
		dueAt: d.dueAt as number,
		estimateMin: d.taskKind === "note" ? 0 : Number(d.estimateMin),
		...(d.taskKind === "note" ? { minBlockMin: 1 } : {}),
		estimateSource: d.taskKind !== "note" && d.fromAi && !d.estimateTouched ? "ai" : "manual",
		firstStep: null,
		plannedStartAt: d.taskKind === "note" ? null : d.plannedStartAt,
		...(repeat ? { repeat } : {}),
	};
}

/** 確認カードで直せる項目 */
export type DraftPatch = Partial<
	Pick<
		Draft,
		| "title"
		| "courseName"
		| "category"
		| "taskKind"
		| "completionNotify"
		| "dueAt"
		| "estimateMin"
		| "plannedStartAt"
	>
> & { repeat?: Partial<RepeatDraft> };

/** カードの編集を適用する。直した項目に付随する更新もここでする */
export function patchDraft(d: Draft, patch: DraftPatch): Draft {
	const { repeat, ...rest } = patch;
	const next: Draft = { ...d, ...rest };
	if (repeat) next.repeat = patchRepeat(d.repeat, repeat);
	// 既存メモを課題へ変更したら通常の入力値へ戻す。切替前に入力した値は保持する。
	if (patch.taskKind === "work" && d.taskKind === "note" && Number(d.estimateMin) === 0) {
		next.estimateMin = "60";
		next.completionNotify = true;
	}
	// 見積もりを本人が直したら "manual" で保存する
	if (patch.estimateMin !== undefined) next.estimateTouched = true;
	// 締切を着手の合図より前にしたら、合図は外す(締切の後に鳴らさない)
	if (
		patch.dueAt !== undefined &&
		patch.dueAt !== null &&
		next.plannedStartAt !== null &&
		patch.dueAt <= next.plannedStartAt
	) {
		next.plannedStartAt = null;
	}
	return next;
}

/** 「いつ始める?」に出す候補。いまより後で、締切より前のものだけ */
export function selectableStarts(
	suggestions: readonly StartSuggestion[],
	now: number,
	dueAt: number | null,
): StartSuggestion[] {
	return suggestions.filter((s) => s.at > now && (dueAt === null || s.at < dueAt));
}

/** 候補をタップしたときの着手の合図。選択中のものをもう一度タップしたら解除 */
export const toggleStart = (current: number | null, at: number): number | null => (current === at ? null : at);
