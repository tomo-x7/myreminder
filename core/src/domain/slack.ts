// 余裕リスト(plan.md §3.6)の表示用の文言
import type { SlackItem } from "../api/types";
import { formatShort } from "./schedule";

/** 空き時間の長さの選択肢(分) */
export const SPARE_CHOICES = [30, 60, 90] as const;

const REASON_TEXT: Record<SlackItem["reason"], string> = {
	big_block: "まとまった時間が要るので、大きく空いている今やる価値が高い",
	uncertain: "見積もりが読めないので、早めに手を付けると読みが当たる",
	before_peak: "山場の手前",
	earliest: "締切が早い",
};

export const slackReasonText = (reason: SlackItem["reason"]): string => REASON_TEXT[reason];

/** 「この60分で: 山場の余裕 +1h」。山場の余裕が変わらないときは、全体の余裕の改善だけ伝える */
export function slackGainText(item: Pick<SlackItem, "bottleneckDeltaMin" | "stressDelta">, spareMin: number): string {
	const head = `この${spareMin}分で: `;
	if (item.bottleneckDeltaMin > 0) return `${head}山場の余裕 +${formatShort(item.bottleneckDeltaMin)}`;
	if (item.stressDelta < 0) return `${head}全体の余裕が少し増える`;
	return `${head}計画への影響はほとんどない`;
}
