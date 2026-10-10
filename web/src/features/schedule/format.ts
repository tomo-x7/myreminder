// 計画まわりの表示用の関数と、リスクの見た目
import { formatJstDate, formatWeekLabel } from "../../lib/date";
import type { PlanTask } from "./hooks";

export type Risk = PlanTask["risk"];

export const RISK_LABEL: Record<Risk, string> = {
	relaxed: "余裕",
	watch: "注意",
	danger: "危険",
	critical: "致命",
};

/** カードの枠・バッジの色 */
export const RISK_STYLE: Record<Risk, { border: string; badge: string }> = {
	relaxed: { border: "border-green-600", badge: "bg-green-600 text-white" },
	watch: { border: "border-yellow-500", badge: "bg-yellow-400 text-yellow-950" },
	danger: { border: "border-orange-500", badge: "bg-orange-500 text-white" },
	critical: { border: "border-red-600", badge: "bg-red-600 text-white" },
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

/** 90 → `1h30m`、40 → `40m`、120 → `2h` */
export function formatShort(min: number): string {
	const total = Math.max(0, Math.round(min));
	const h = Math.floor(total / 60);
	const m = total % 60;
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h${m}m`;
}

/** 270 → `4.5h`、40 → `40分`。空きや余裕の大きさの表示。負の値は符号を付ける */
export function formatHours(min: number): string {
	const sign = min < 0 ? "-" : "";
	const abs = Math.abs(min);
	if (abs < 60) return `${sign}${Math.round(abs)}分`;
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

/** 山場の見出し: `今週の山場: 11/18(水)、余裕 1.5h` */
export function bottleneckText(b: { dueAt: number; slackUsual: number }, now: number): string {
	const week = formatWeekLabel(b.dueAt, now);
	const head = week ? `${week}の山場` : "山場";
	const slack =
		b.slackUsual < 0
			? `普段のペースでは ${formatHours(-b.slackUsual)} 足りない`
			: `余裕 ${formatHours(b.slackUsual)}`;
	return `${head}: ${formatJstDate(b.dueAt)}、${slack}`;
}
