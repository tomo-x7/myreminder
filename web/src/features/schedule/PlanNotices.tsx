import { Link } from "wouter";
import { formatDue } from "../../lib/date";
import type { Plan } from "./hooks";

/** 期限切れと、本気でも間に合わない場合の候補 */
export function PlanAlerts({ plan, now }: { plan: Plan; now: number }) {
	return (
		<>
			{plan.overdue.length > 0 && (
				<section className="flex flex-col border-l-2 border-danger pl-2">
					<h2 className="text-xs font-semibold text-danger">期限切れ {plan.overdue.length}件</h2>
					<ul className="flex flex-col">
						{plan.overdue.map((t) => (
							<li key={t.id}>
								<Link
									href={`/tasks/${t.id}`}
									className="flex items-baseline justify-between gap-2 py-0.5"
								>
									<span className="min-w-0 truncate font-medium">{t.title}</span>
									<span className="shrink-0 text-xs text-danger">{formatDue(t.dueAt, now)}</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
			{plan.dropCandidates.length > 0 && (
				<p className="border-l-2 border-danger pl-2 text-sm text-danger">
					本気でも間に合わない。手を抜く・延長を頼む候補:{" "}
					{plan.dropCandidates.map((t, i) => (
						<span key={t.id}>
							{i > 0 && "、"}
							<Link href={`/tasks/${t.id}`} className="font-semibold underline underline-offset-2">
								{t.title}
							</Link>
						</span>
					))}
				</p>
			)}
		</>
	);
}
