import type { ReviewDay } from "core/api/types";
import { weekBars } from "core/domain/review-view";

/** 7日の作業時間の棒。活動日(起床から次の起床まで)ごと。高さは週の中の最大に合わせる(最小 1 時間ぶんの高さ) */
export function WeekBars({ days }: { days: readonly ReviewDay[] }) {
	return (
		<ul className="grid grid-cols-7 gap-2" aria-label="日ごとの作業時間">
			{weekBars(days).map((d) => (
				<li key={d.date} className="flex flex-col items-center">
					<span className="h-4 text-xs text-sub">{d.hours}</span>
					<div className="flex h-20 w-full items-end justify-center border-b border-line">
						<div
							className="w-2/3 bg-ink"
							style={{ height: `${d.percent}%`, minHeight: d.workedMin > 0 ? 2 : 0 }}
							role="img"
							aria-label={d.label}
						/>
					</div>
					<span className="mt-0.5 text-xs font-medium">{d.weekday}</span>
					<span className="text-[10px] leading-3 text-faint">{d.day}</span>
					<span className="h-3 text-[10px] leading-3 text-sub">{d.allNighter ? "徹夜" : ""}</span>
				</li>
			))}
		</ul>
	);
}
