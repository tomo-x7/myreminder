// ホームの「次の1件」の表示用の値
import type { Course, PlanTask } from "../api/types";
import { formatJstDateTime } from "./date";
import { formatHours, progressText, startDeadline } from "./schedule";
import { formatDuration } from "./time-input";

/** `科目名 ・ 見積もり 1時間 ・ やった分 40m` */
export function nextMeta(task: PlanTask, course: Course | undefined): string {
	return [course?.name, `見積もり ${formatDuration(task.estimateMin)}`, progressText(task)]
		.filter(Boolean)
		.join(" ・ ");
}

export type StartDeadlineView = {
	/** 着手デッドラインの日時。置けないときは null */
	deadline: string | null;
	/** デッドラインの根拠(plan.md §2.2-1)。置けないときは、その理由 */
	reason: string;
	/** 着手予定(本人が決めた)か、おすすめの着手。どちらもなければ null */
	start: { label: string; text: string; late: boolean } | null;
};

/** 着手デッドラインと、その正直な根拠(plan.md §2.2-1) */
export function startDeadlineView(task: PlanTask, now: number): StartDeadlineView {
	const d = startDeadline(task);
	const need = formatHours(task.remainingP80);
	const hard = `本気で使える空き ${formatHours(Math.max(0, task.freeHardMin))} / 必要 ${need}`;
	const reason =
		d === null
			? `本気で詰めても、睡眠を削らずには間に合わない見込み(${hard})`
			: d.mode === "usual"
				? `この時刻までに始めないと、普段のペースでは収まらなくなる(残り空き ${formatHours(Math.max(0, task.freeUsualMin))} / 必要 ${need})`
				: `この時刻までに始めないと、睡眠を削らずには間に合わない(${hard})`;
	let start: StartDeadlineView["start"] = null;
	if (task.plannedStartAt !== null) {
		const late = task.plannedStartAt < now;
		start = {
			label: "着手予定",
			text: `${formatJstDateTime(task.plannedStartAt)}${late ? "(過ぎています)" : ""}`,
			late,
		};
	} else if (task.recommendedStart !== null) {
		start = { label: "おすすめの着手", text: formatJstDateTime(task.recommendedStart), late: false };
	}
	return { deadline: d ? formatJstDateTime(d.at) : null, reason, start };
}
