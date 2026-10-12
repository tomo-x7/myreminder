import type { TaskCreate } from "../api/types";
import type { RepeatDraft } from "./repeat-draft";

export type Category = NonNullable<TaskCreate["category"]>;

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
	/** 締切(epoch ms)。未入力なら null。入力欄の文字列との変換は画面の層でする */
	dueAt: number | null;
	estimateMin: string;
	/** 本人が見積もりを直したら "manual" で保存する */
	estimateTouched: boolean;
	firstStep: string;
	plannedStartAt: number | null;
	/** 繰り返し。手入力のカードは「なし」、AI は文に書いてあれば既定値に入れる */
	repeat: RepeatDraft;
	/** AI の解釈(確認の手がかり)。手入力のカードでは null */
	dueText: string | null;
	fromAi: boolean;
	needsReview: boolean;
	reviewReasons: string[];
};
