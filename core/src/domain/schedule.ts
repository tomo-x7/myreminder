// 計画まわりの表示用の関数。リスクの色(Tailwind のクラス)は画面の層が決める
import type { PlanTask } from "../api/types";
import { formatJstDate, formatWeekLabel } from "./date";
import { formatDuration } from "./time-input";

export type Risk = PlanTask["risk"];

export const RISK_LABEL: Record<Risk, string> = {
	relaxed: "余裕",
	watch: "注意",
	danger: "危険",
	critical: "致命",
};

const RISK_RANK: Record<Risk, number> = { relaxed: 0, watch: 1, danger: 2, critical: 3 };

/** 次の1件: リスクが高い順 → 着手デッドラインが早い順 → 締切が早い順 */
export function pickNext<T extends Pick<PlanTask, "risk" | "latestStartUsual" | "dueAt">>(
	tasks: readonly T[],
): T | undefined {
	return [...tasks].sort(
		(a, b) =>
			RISK_RANK[b.risk] - RISK_RANK[a.risk] ||
			(a.latestStartUsual ?? Number.NEGATIVE_INFINITY) - (b.latestStartUsual ?? Number.NEGATIVE_INFINITY) ||
			a.dueAt - b.dueAt,
	)[0];
}

/** formatDuration と同じ(`1h30m`)。呼び出し側の名前を変えないための別名 */
export const formatShort = formatDuration;

/** 270 → `4.5h`、40 → `40m`。空きや余裕の大きさの表示。負の値は符号を付ける */
export function formatHours(min: number): string {
	const sign = min < 0 ? "-" : "";
	const abs = Math.abs(min);
	if (abs < 60) return `${sign}${Math.round(abs)}m`;
	return `${sign}${(Math.round((abs / 60) * 10) / 10).toString()}h`;
}

/** 着手デッドライン。普段のペースで置けるならそれ、置けなければ本気のペースのもの */
export function startDeadline(t: Pick<PlanTask, "latestStartUsual" | "latestStartHard">) {
	if (t.latestStartUsual !== null) return { at: t.latestStartUsual, mode: "usual" as const };
	if (t.latestStartHard !== null) return { at: t.latestStartHard, mode: "hard" as const };
	return null;
}

/** 進捗の見せ方(plan.md §2.2-8): 半分未満は「やった分」、半分以上は「残り」 */
export function progressText(t: Pick<PlanTask, "progress" | "actualMin" | "remainingP80">): string | null {
	if ((t.progress ?? 0) < 50) return t.actualMin > 0 ? `やった分 ${formatShort(t.actualMin)}` : null;
	return `残り ${formatShort(t.remainingP80)}`;
}

/** 山場: `11/18(水) ・ 今週 ・ 余裕 1.5h`。足りないときは `余裕 -28m` */
export function bottleneckText(b: { dueAt: number; slackUsual: number }, now: number): string {
	const slack = b.slackUsual < 0 ? `不足 ${formatHours(-b.slackUsual)}` : `余裕 ${formatHours(b.slackUsual)}`;
	return [formatJstDate(b.dueAt), formatWeekLabel(b.dueAt, now), slack].filter(Boolean).join(" ・ ");
}
