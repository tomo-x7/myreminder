// ホームの「次の1件」の表示用の値
import type { Course, PlanTask } from "../api/types";
import { formatJstDateTime } from "./date";
import { formatHours, progressText, startDeadline } from "./schedule";
import { formatDuration } from "./time-input";

/** `科目名 ・ 見積もり 1h ・ やった分 40m` */
export function nextMeta(task: PlanTask, course: Course | undefined): string {
	return [course?.name, `見積もり ${formatDuration(task.estimateMin)}`, progressText(task)]
		.filter(Boolean)
		.join(" ・ ");
}

export type StartDeadlineView = {
	/** 着手デッドラインの日時。置けないときは null */
	deadline: string | null;
	/** デッドラインの根拠(plan.md §2.2-1): `空き 6.6h / 必要 4.4h(普段のペース)` */
	reason: string;
	/** 着手予定(本人が決めた)か、おすすめ着手。どちらもなければ null */
	start: { label: string; text: string; late: boolean } | null;
};

/** 着手デッドラインと、その正直な根拠(plan.md §2.2-1) */
export function startDeadlineView(task: PlanTask, now: number): StartDeadlineView {
	const d = startDeadline(task);
	const need = formatHours(task.remainingP80);
	const free = (min: number) => `空き ${formatHours(Math.max(0, min))} / 必要 ${need}`;
	const reason =
		d === null
			? `睡眠を削らないと間に合わない(${free(task.freeHardMin)})`
			: d.mode === "usual"
				? `${free(task.freeUsualMin)}(普段のペース)`
				: `${free(task.freeHardMin)}(本気のペース)`;
	let start: StartDeadlineView["start"] = null;
	if (task.plannedStartAt !== null) {
		const late = task.plannedStartAt < now;
		start = {
			label: "着手予定",
			text: formatJstDateTime(task.plannedStartAt),
			late,
		};
	} else if (task.recommendedStart !== null) {
		start = { label: "おすすめ着手", text: formatJstDateTime(task.recommendedStart), late: false };
	}
	return { deadline: d ? formatJstDateTime(d.at) : null, reason, start };
}
