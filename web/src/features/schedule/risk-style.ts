import type { Risk } from "core/domain/schedule";

/** リスクの色。面は塗らず、左の線と文字色だけで示す(余裕は色を付けない) */
export const RISK_STYLE: Record<Risk, { border: string; text: string }> = {
	relaxed: { border: "border-line", text: "text-sub" },
	watch: { border: "border-warn", text: "text-warn" },
	danger: { border: "border-danger", text: "text-danger" },
	critical: { border: "border-danger", text: "text-danger font-bold" },
};
