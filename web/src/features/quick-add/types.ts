import type { InferRequestType, InferResponseType } from "hono/client";
import type { api } from "../../lib/api";

/** POST /api/tasks の本文。worker の taskCreateSchema の入力型 */
export type TaskCreateInput = InferRequestType<typeof api.api.tasks.$post>["json"];

type ParseResponse = InferResponseType<typeof api.api.parse.line.$post, 200>;
export type ParsedCandidate = ParseResponse["candidates"][number];
export type StartSuggestion = ParseResponse["startSuggestions"][number];

export type Category = NonNullable<TaskCreateInput["category"]>;

export const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
	{ value: "report", label: "レポート" },
	{ value: "exercise", label: "演習" },
	{ value: "quiz", label: "小テスト" },
	{ value: "presentation", label: "発表準備" },
	{ value: "other", label: "その他" },
];

/** 確認カード1枚分の、編集中の値。入力欄に合わせて文字列で持つ */
export type Draft = {
	key: string;
	title: string;
	/** 自由入力。一覧の科目名/別名と一致すれば、保存時に courseId を付ける */
	courseName: string;
	/** AI が結びつけた科目 id と、そのときの名前。名前を変えたら使わない */
	aiCourse: { id: string; name: string } | null;
	category: Category;
	/** datetime-local の値(JST)。空なら未入力 */
	dueLocal: string;
	estimateMin: string;
	/** 本人が見積もりを直したら "manual" で保存する */
	estimateTouched: boolean;
	firstStep: string;
	plannedStartAt: number | null;
	/** AI の解釈(確認の手がかり)。手入力のカードでは null */
	dueText: string | null;
	fromAi: boolean;
	needsReview: boolean;
	reviewReasons: string[];
};
