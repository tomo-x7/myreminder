// 余裕リスト(plan.md §3.6)の表示用の文言
import type { SlackItem } from "../api/types";
import { formatDuration } from "./time-input";

/** 空き時間の長さの選択肢(分) */
export const SPARE_CHOICES = [30, 60, 90] as const;

const REASON_TEXT: Record<SlackItem["reason"], string> = {
	big_block: "まとまった時間が要る",
	uncertain: "見積もりが不確か",
	before_peak: "山場の手前",
	earliest: "締切が早い",
};

export const slackReasonText = (reason: SlackItem["reason"]): string => REASON_TEXT[reason];

/** `1h30m → 山場の余裕 +40m`。山場の余裕が増えないときは数字がないので null(理由だけ出す) */
export function slackGainText(item: Pick<SlackItem, "bottleneckDeltaMin">, spareMin: number): string | null {
	if (item.bottleneckDeltaMin <= 0) return null;
	return `${formatDuration(spareMin)} → 山場の余裕 +${formatDuration(item.bottleneckDeltaMin)}`;
}
