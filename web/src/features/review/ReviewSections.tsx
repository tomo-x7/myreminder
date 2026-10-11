import { Link } from "wouter";
import { listClass, SectionTitle } from "../../components/ui";
import { formatJstDateTime } from "../../lib/date";
import { formatHours } from "../schedule/format";
import { ratioText } from "./format";
import type { Review } from "./hooks";
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

/** 「徹夜なし 6/7 日」。ストリークにはしない(連続の長さは数えない) */
export function NoAllNighterCard({ review }: { review: Review }) {
	if (review.countedDays === 0) return null;
	return (
		<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5">
			<dt className="text-xs text-sub">徹夜なし</dt>
			<dd className="font-bold">
				{review.noAllNighterDays}/{review.countedDays} 日
			</dd>
			<dd className="col-span-2 text-xs text-faint">睡眠時間帯に1時間以上かかる作業がなかった日の数です</dd>
		</dl>
	);
}

/** 提出したタスク。期限後は事実だけ(色は付けない) */
export function SubmittedList({ submitted }: { submitted: Review["submitted"] }) {
	return (
		<section className="flex flex-col">
			<SectionTitle>提出したもの</SectionTitle>
			{submitted.length === 0 ? (
				<p className="py-2 text-xs text-faint">この週に提出したものはありません</p>
			) : (
				<ul className={listClass}>
					{submitted.map((t) => (
						<li key={t.id}>
							<Link href={`/tasks/${t.id}`} className="flex flex-col py-2 active:bg-wash">
								<span className="font-semibold">{t.title}</span>
								<span className="text-xs text-sub">
									{t.onTime ? "期限内" : "期限後"}・締切の{" "}
									{formatHours(Math.abs(t.dueAt - t.submittedAt) / 60_000)}
									{t.onTime ? "前" : "後"}に提出({formatJstDateTime(t.submittedAt)})
								</span>
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
	const latest = [...estimateTrend].reverse().find((t) => t.medianRatio !== null)?.medianRatio ?? null;
	const ratio = estimate.medianRatio ?? latest;
	return (
		<section className="flex flex-col gap-2">
			<SectionTitle>見積もりの精度</SectionTitle>
			{ratio === null ? (
				<p className="text-xs text-faint">まだ比べられる記録がありません</p>
			) : (
				<div className="flex flex-col gap-0.5">
					<p className="font-bold">{ratioText(ratio)}</p>
					{estimate.medianRatio === null && (
						<p className="text-xs text-sub">この週に完了したものはなく、直近の週の値です</p>
					)}
				</div>
			)}
			<div className="flex flex-col gap-0.5">
				<Sparkline
					values={estimateTrend.map((t) => t.medianRatio)}
					label={`見積もりに対する実績の比率の8週の推移。${estimateTrend.map((t) => (t.medianRatio === null ? "なし" : t.medianRatio.toFixed(1))).join("、")}`}
				/>
				<p className="text-xs text-faint">8週の中央値の推移(破線が見積もりどおり)</p>
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
