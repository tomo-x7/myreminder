// 夜の確認(plan.md §3.8)で出す「今日の予定」
import type { PlanTask } from "../api/types";
import { DAY, formatJstTime, startOfJstDay } from "./date";

type Planned = Pick<PlanTask, "plannedStartAt" | "recommendedStart">;

/** 予定の着手時刻。本人が決めた着手時刻を優先し、なければおすすめの着手時刻 */
export const plannedFor = (t: Planned): number | null => t.plannedStartAt ?? t.recommendedStart;

/** 今日(JST)に着手する予定のタスク */
export function todaysTasks<T extends Planned>(tasks: readonly T[], now: number): T[] {
	const dayStart = startOfJstDay(now);
	return tasks.filter((t) => {
		const at = plannedFor(t);
		return at !== null && at >= dayStart && at < dayStart + DAY;
	});
}

/** 「着手予定 1:10」「おすすめの着手 2:10」。時刻がなければ null */
export function plannedText(t: Planned): string | null {
	const at = plannedFor(t);
	if (at === null) return null;
	return `${t.plannedStartAt !== null ? "着手予定" : "おすすめの着手"} ${formatJstTime(at)}`;
}
