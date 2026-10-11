import type { Review } from "core/api/types";
import { estimateView, submittedText } from "core/domain/review-view";
import { formatHours } from "core/domain/schedule";
import { Link } from "wouter";
import { listClass, SectionTitle } from "../../components/ui";
import { Sparkline } from "./Sparkline";

/** 合計と前の週。前の週は比べるための数字として並べるだけ(増減の色や言葉は付けない) */
export function TotalCard({ review }: { review: Review }) {
	return (
		<dl className="flex items-baseline gap-x-6 border-y border-line py-2">
			<div>
				<dt className="text-xs text-sub">作業</dt>
				<dd className="text-base font-bold">{formatHours(review.totalMin)}</dd>
			</div>
			<div>
				<dt className="text-xs text-sub">前の週</dt>
				<dd className="text-base font-medium text-sub">{formatHours(review.prevWeekTotalMin)}</dd>
			</div>
		</dl>
	);
}

/** 「徹夜なし 6/7日」。ストリークにはしない(連続の長さは数えない) */
export function NoAllNighterCard({ review }: { review: Review }) {
	if (review.countedDays === 0) return null;
	return (
		<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5">
			<dt className="text-xs text-sub">徹夜なし</dt>
			<dd className="font-bold">
				{review.noAllNighterDays}/{review.countedDays}日
			</dd>
		</dl>
	);
}

/** 提出したタスク。期限後は事実だけ(色は付けない) */
export function SubmittedList({ submitted }: { submitted: Review["submitted"] }) {
	return (
		<section className="flex flex-col">
			<SectionTitle>提出したもの</SectionTitle>
			{submitted.length === 0 ? (
				<p className="py-2 text-xs text-faint">なし</p>
			) : (
				<ul className={listClass}>
					{submitted.map((t) => (
						<li key={t.id}>
							<Link href={`/tasks/${t.id}`} className="flex flex-col py-2 active:bg-wash">
								<span className="font-semibold">{t.title}</span>
								<span className="text-xs text-sub">{submittedText(t)}</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

/** 見積もりの精度。この週に完了したものの中央値と、8週の推移 */
export function EstimateCard({ review }: { review: Review }) {
	const { estimate, estimateTrend } = review;
	const { text, fromLatestWeek, trendLabel } = estimateView(review);
	return (
		<section className="flex flex-col gap-2">
			<SectionTitle>見積もり精度</SectionTitle>
			{text === null ? (
				<p className="text-xs text-faint">記録なし</p>
			) : (
				<div className="flex flex-col gap-0.5">
					<p className="font-bold">{text}</p>
					{fromLatestWeek && <p className="text-xs text-sub">直近の週の値</p>}
				</div>
			)}
			<div className="flex flex-col gap-0.5">
				<Sparkline values={estimateTrend.map((t) => t.medianRatio)} label={trendLabel} />
				<p className="text-xs text-faint">8週の推移(破線 = 1.0倍)</p>
			</div>
			{estimate.tasks.length > 0 && (
				<ul className={listClass}>
					{estimate.tasks.map((t) => (
						<li key={t.id} className="flex items-baseline justify-between gap-2 py-1.5">
							<Link href={`/tasks/${t.id}`} className="min-w-0 truncate">
								{t.title}
							</Link>
							<span className="shrink-0 text-xs text-sub">
								{formatHours(t.estimateMin)} → {formatHours(t.actualMin)}
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
