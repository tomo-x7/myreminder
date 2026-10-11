import type { InboxItem } from "../api/types";
import { toDatetimeLocal } from "./date";
import { type CourseOption, emptyDraft, resolveCourseId } from "./draft";
import type { Category, Draft } from "./draft-types";

/** 取り込み元の種類 → 種類の初期値。当てずっぽうなので、確認カードで直せる */
const KIND_CATEGORY: Record<string, Category> = {
	SHORT_ANSWER_QUESTION: "quiz",
	MULTIPLE_CHOICE_QUESTION: "quiz",
};

export const SOURCE_LABEL: Record<string, string> = { classroom: "Classroom", webclass: "WebClass" };

/** 受信箱のアイテム → クイック追加の確認カードの下書き。科目名は登録済みの科目に名前(別名)で合わせる */
export function itemToDraft(item: InboxItem, courses: readonly CourseOption[]): Draft {
	const base = emptyDraft(item.title);
	const named: Draft = { ...base, courseName: item.courseName ?? "" };
	const course = courses.find((c) => c.id === resolveCourseId(named, courses));
	const needsReview = item.dueAt === null;
	return {
		...named,
		courseName: course?.name ?? named.courseName,
		category: (item.kind && KIND_CATEGORY[item.kind]) || "other",
		dueLocal: item.dueAt === null ? "" : toDatetimeLocal(item.dueAt),
		needsReview,
		reviewReasons: needsReview ? ["取り込み元に締切がありません。締切を入力してください"] : [],
	};
}
