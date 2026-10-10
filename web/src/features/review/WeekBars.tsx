import { formatHours } from "../schedule/format";
import { dateKeyParts } from "./format";
import type { ReviewDay } from "./hooks";

/** 7日の作業時間の棒。活動日(起床から次の起床まで)ごと。高さは週の中の最大に合わせる(最小 1 時間ぶんの高さ) */
export function WeekBars({ days }: { days: readonly ReviewDay[] }) {
	const max = Math.max(60, ...days.map((d) => d.workedMin));
	return (
		<ul className="grid grid-cols-7 gap-1.5" aria-label="日ごとの作業時間">
			{days.map((d) => {
				const { day, weekday } = dateKeyParts(d.date);
				const pct = (d.workedMin / max) * 100;
				return (
					<li key={d.date} className="flex flex-col items-center gap-1">
						<span className="h-4 text-xs tabular-nums text-gray-600">
							{d.workedMin > 0 ? formatHours(d.workedMin) : ""}
						</span>
						<div className="flex h-28 w-full items-end rounded-md bg-gray-100">
							<div
								className="w-full rounded-md bg-blue-500"
								style={{ height: `${pct}%`, minHeight: d.workedMin > 0 ? 4 : 0 }}
								role="img"
								aria-label={`${weekday}曜 ${d.workedMin}分`}
							/>
						</div>
						<span className="text-xs font-medium text-gray-700">{weekday}</span>
						<span className="text-[10px] tabular-nums text-gray-500">{day}</span>
						<span className="h-3 text-[10px] text-gray-500">{d.allNighter ? "徹夜" : ""}</span>
					</li>
				);
			})}
		</ul>
	);
}
