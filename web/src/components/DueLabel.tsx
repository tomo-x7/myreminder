import { formatDueParts } from "../lib/date";

/**
 * 締切の表示。`10/14(火) 23:59 ・ 3日後 ・ 今週`(plan.md §2.2-2)を、日時を大きく・相対を添えて出す。
 * 期限切れは赤。size=lg はホームの大きいカード用
 */
export function DueLabel({ dueAt, now, size = "md" }: { dueAt: number; now: number; size?: "md" | "lg" }) {
	const { date, time, relative, week } = formatDueParts(dueAt, now);
	const overdue = dueAt < now;
	const big = size === "lg";
	return (
		<p className={`flex flex-wrap items-baseline gap-x-2 ${overdue ? "text-red-600" : "text-gray-900"}`}>
			<span className={`${big ? "text-3xl" : "text-xl"} font-extrabold tabular-nums`}>
				{date} {time}
			</span>
			<span className={`${big ? "text-xl" : "text-base"} font-bold`}>{relative}</span>
			{week && <span className={`${big ? "text-xl" : "text-base"} font-bold`}>{week}</span>}
		</p>
	);
}
