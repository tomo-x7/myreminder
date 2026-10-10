import { Link } from "wouter";
import { SectionTitle } from "../../components/ui";
import { formatJstDateTime } from "../../lib/date";
import { formatHours } from "../schedule/format";
import { ratioText } from "./format";
import type { Review } from "./hooks";
import { Sparkline } from "./Sparkline";

const card = "flex flex-col gap-2 rounded-xl border border-gray-300 bg-white p-4";

/** 合計と前の週。前の週は比べるための数字として並べるだけ(増減の色や言葉は付けない) */
export function TotalCard({ review }: { review: Review }) {
	return (
		<section className={card}>
			<p className="flex flex-wrap items-baseline gap-x-3">
				<span className="text-3xl font-extrabold tabular-nums text-gray-900">
					{formatHours(review.totalMin)}
				</span>
				<span className="text-base text-gray-600">作業</span>
				<span className="text-base tabular-nums text-gray-600">
					前の週 {formatHours(review.prevWeekTotalMin)}
				</span>
			</p>
		</section>
	);
}

/** 「徹夜なし 6/7 日」。ストリークにはしない(連続の長さは数えない) */
export function NoAllNighterCard({ review }: { review: Review }) {
	if (review.countedDays === 0) return null;
	return (
		<section className={card}>
			<p className="text-lg font-bold text-gray-900">
				徹夜なし{" "}
				<span className="tabular-nums">
					{review.noAllNighterDays}/{review.countedDays}
				</span>{" "}
				日
			</p>
			<p className="text-xs text-gray-500">睡眠時間帯に1時間以上かかる作業がなかった日の数です</p>
		</section>
	);
}

/** 提出したタスク。期限後は事実だけ(色は付けない) */
export function SubmittedList({ submitted }: { submitted: Review["submitted"] }) {
	return (
		<section className="flex flex-col gap-2">
			<SectionTitle>提出したもの</SectionTitle>
			{submitted.length === 0 ? (
				<p className="text-sm text-gray-600">この週に提出したものはありません</p>
			) : (
				<ul className="flex flex-col gap-2">
					{submitted.map((t) => (
						<li key={t.id}>
							<Link href={`/tasks/${t.id}`} className={card}>
								<span className="text-base font-semibold text-gray-900">{t.title}</span>
								<span className="text-sm text-gray-600">
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
			<div className={card}>
				{ratio === null ? (
					<p className="text-sm text-gray-600">まだ比べられる記録がありません</p>
				) : (
					<>
						<p className="text-lg font-bold text-gray-900">{ratioText(ratio)}</p>
						{estimate.medianRatio === null && (
							<p className="text-xs text-gray-500">この週に完了したものはなく、直近の週の値です</p>
						)}
					</>
				)}
				<Sparkline
					values={estimateTrend.map((t) => t.medianRatio)}
					label={`見積もりに対する実績の比率の8週の推移。${estimateTrend.map((t) => (t.medianRatio === null ? "なし" : t.medianRatio.toFixed(1))).join("、")}`}
				/>
				<p className="text-xs text-gray-500">8週の中央値の推移(破線が見積もりどおり)</p>
				{estimate.tasks.length > 0 && (
					<ul className="mt-1 flex flex-col gap-1 border-t border-gray-200 pt-2">
						{estimate.tasks.map((t) => (
							<li key={t.id} className="flex items-baseline justify-between gap-2 text-sm">
								<Link href={`/tasks/${t.id}`} className="min-w-0 truncate text-gray-900">
									{t.title}
								</Link>
								<span className="shrink-0 tabular-nums text-gray-600">
									{formatHours(t.estimateMin)} → {formatHours(t.actualMin)}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
