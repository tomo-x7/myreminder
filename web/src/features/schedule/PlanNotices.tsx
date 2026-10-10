import { Link } from "wouter";
import { formatDue } from "../../lib/date";
import { bottleneckText } from "./format";
import type { Plan } from "./hooks";

/** 今週の山場。ホームの次の1件の下に出す */
export function BottleneckCard({ bottleneck, now }: { bottleneck: Plan["bottleneck"]; now: number }) {
	if (!bottleneck) return null;
	const short = bottleneck.slackUsual < 0;
	return (
		<section
			className={`rounded-xl border px-4 py-3 ${short ? "border-orange-400 bg-orange-50" : "border-gray-300 bg-white"}`}
		>
			<p className="text-base font-semibold text-gray-900">{bottleneckText(bottleneck, now)}</p>
		</section>
	);
}

/** 期限切れと、本気でも間に合わない場合の候補 */
export function PlanAlerts({ plan, now }: { plan: Plan; now: number }) {
	return (
		<>
			{plan.overdue.length > 0 && (
				<section className="flex flex-col gap-2 rounded-xl border border-red-300 bg-red-50 p-3">
					<h2 className="text-base font-bold text-red-800">期限が過ぎています({plan.overdue.length}件)</h2>
					<ul className="flex flex-col gap-1">
						{plan.overdue.map((t) => (
							<li key={t.id}>
								<Link href={`/tasks/${t.id}`} className="flex flex-col text-red-900">
									<span className="font-semibold">{t.title}</span>
									<span className="text-sm">{formatDue(t.dueAt, now)}</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
			{plan.dropCandidates.length > 0 && (
				<p className="rounded-xl border border-red-400 bg-white px-4 py-3 text-base text-red-900">
					本気でも間に合わない。手を抜く・延長を頼む候補:{" "}
					{plan.dropCandidates.map((t, i) => (
						<span key={t.id}>
							{i > 0 && "、"}
							<Link href={`/tasks/${t.id}`} className="font-semibold underline">
								{t.title}
							</Link>
						</span>
					))}
				</p>
			)}
		</>
	);
}
