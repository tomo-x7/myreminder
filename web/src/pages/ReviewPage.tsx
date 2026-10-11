import { Link, useSearchParams } from "wouter";
import { btnSecondary, PageHeader, QueryState } from "../components/ui";
import { useReview } from "core/queries/review";
import { weekLabel } from "core/domain/review";
import { EstimateCard, FreshStart, NoAllNighterCard, SubmittedList, TotalCard, WeekBars } from "../features/review";

/** 移動できない側(今週より先)。枠だけ残して薄くする */
const navOff = `${btnSecondary} opacity-40`;

/** 週次のふりかえり(#26)。事実だけを並べる。ストリークや責める言い方は使わない */
export function ReviewPage() {
	const [params] = useSearchParams();
	const week = params.get("week") ?? undefined;
	const review = useReview(week);

	return (
		<div className="flex flex-col gap-3">
			<PageHeader title="ふりかえり" />
			<FreshStart />
			<QueryState query={review}>
				{(r) => (
					<>
						<nav className="flex items-center justify-between gap-2" aria-label="週の移動">
							<Link href={`/review?week=${r.prevWeek}`} className={btnSecondary}>
								← 前の週
							</Link>
							<div className="text-center">
								<p className="font-bold">{weekLabel(r.week)}</p>
								{r.isCurrentWeek && <p className="text-xs text-sub">今週(途中)</p>}
							</div>
							{r.nextWeek ? (
								<Link href={`/review?week=${r.nextWeek}`} className={btnSecondary}>
									次の週 →
								</Link>
							) : (
								<span className={navOff} aria-disabled="true">
									次の週 →
								</span>
							)}
						</nav>

						{r.unconfirmedCount > 0 && (
							<Link
								href="/status"
								className="flex items-center justify-between border-l-2 border-warn py-0.5 pl-2 font-semibold text-warn"
							>
								確認待ちの記録が {r.unconfirmedCount} 件あります →
							</Link>
						)}

						<TotalCard review={r} />
						<WeekBars days={r.days} />
						<NoAllNighterCard review={r} />
						<SubmittedList submitted={r.submitted} />
						<EstimateCard review={r} />
					</>
				)}
			</QueryState>
		</div>
	);
}
