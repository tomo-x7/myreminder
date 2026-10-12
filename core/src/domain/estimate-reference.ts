// 見積もりの欄の下の「実績」の行(ai-docs/specs/ui.md の文言、planner.md「入力欄の実績」)
import type { EstimateReference } from "../api/types";
import { CATEGORY_OPTIONS, type Category } from "./draft-types";
import { formatDuration } from "./time-input";

/** 実績の括弧の中に出す、入力の文脈。種類は API の応答に入らないので、呼び出し側から渡す */
export type ReferenceContext = { category: Category; courseName: string | null };

/** 実績がなければ null。`実績 1h10m・50m・45m(情報倫理・レポート)` */
export function referenceText(ref: EstimateReference, ctx: ReferenceContext): string | null {
	if (ref.items.length === 0) return null;
	const kind = CATEGORY_OPTIONS.find((o) => o.value === ctx.category)?.label ?? "";
	const scope =
		ref.level === "series"
			? "同じ繰り返し"
			: ref.level === "course" && ctx.courseName
				? `${ctx.courseName}・${kind}`
				: kind;
	const actuals = ref.items.map((i) => formatDuration(i.actualMin)).join("・");
	return `実績 ${actuals}(${scope})`;
}
