import { formatDueParts } from "../lib/date";

/**
 * 締切の表示。`10/14(火) 23:59 ・ 3日後 ・ 今週`(plan.md §2.2-2)。
 * 日時を太く、相対(N日後)を添える。期限切れは赤。size=lg はホームの次の1件と確認用
 */
export function DueLabel({ dueAt, now, size = "md" }: { dueAt: number; now: number; size?: "md" | "lg" }) {
	const { date, time, relative, week } = formatDueParts(dueAt, now);
	const overdue = dueAt < now;
	const big = size === "lg";
	return (
		<p className={`flex flex-wrap items-baseline gap-x-1.5 ${overdue ? "text-danger" : ""}`}>
			<span className={`${big ? "text-lg leading-6" : "text-sm"} font-semibold`}>
				{date} {time}
			</span>
			<span className={`${big ? "text-sm" : "text-xs"} font-medium`}>{relative}</span>
			{week && <span className={`${big ? "text-sm" : "text-xs"} text-sub`}>{week}</span>}
		</p>
	);
}
