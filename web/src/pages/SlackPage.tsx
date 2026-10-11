import type { SlackItem } from "core/api/types";
import { SPARE_CHOICES, slackGainText, slackReasonText } from "core/domain/slack";
import { formatDuration } from "core/domain/time-input";
import { useNow } from "core/hooks/use-now";
import { useSlackView } from "core/screens/slack";
import { useStartTask } from "core/screens/start-task";
import { Link } from "wouter";
import { DueLabel } from "../components/DueLabel";
import { btnSecondary, chipClass, Empty, ErrorNotice, listClass, PageHeader, QueryState } from "../components/ui";

function SlackRow({ item, spareMin, now }: { item: SlackItem; spareMin: number; now: number }) {
	const start = useStartTask(item.id);
	const gain = slackGainText(item, spareMin);
	return (
		<li className="flex items-start gap-2 py-2">
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<Link href={`/tasks/${item.id}`} className="flex flex-col">
					<span className="font-semibold">{item.title}</span>
					<DueLabel dueAt={item.dueAt} now={now} />
				</Link>
				{gain && <p className="text-xs font-medium">{gain}</p>}
				<p className="text-xs text-sub">{slackReasonText(item.reason)}</p>
				{start.error && <ErrorNotice>{start.error}</ErrorNotice>}
			</div>
			<button
				type="button"
				disabled={start.disabled}
				onClick={start.start}
				className={`${btnSecondary} shrink-0`}
			>
				{start.working ? "作業中" : "始める"}
			</button>
		</li>
	);
}

/** 余裕リスト(plan.md §3.6)。余裕のあるタスクを、今やると生み出せる余裕の大きい順に。説明は plan.md にあり、画面には書かない */
export function SlackPage() {
	const now = useNow();
	const { list, spare, shown, choose, reset } = useSlackView();

	return (
		<div className="flex flex-col gap-3">
			<PageHeader title="余裕リスト" />
			<fieldset className="flex flex-wrap items-center gap-1.5">
				<legend className="sr-only">空き時間の長さ</legend>
				<span aria-hidden="true" className="text-xs text-sub">
					空き
				</span>
				{SPARE_CHOICES.map((m) => (
					<button
						key={m}
						type="button"
						aria-pressed={shown === m}
						onClick={() => choose(m)}
						className={chipClass(shown === m)}
					>
						{formatDuration(m)}
					</button>
				))}
				{spare !== undefined && (
					<button type="button" onClick={reset} className="text-xs text-sub underline underline-offset-2">
						次の空き
					</button>
				)}
			</fieldset>

			<QueryState query={list}>
				{(data) =>
					data.items.length === 0 ? (
						<Empty>なし</Empty>
					) : (
						<ol className={`${listClass} border-t`}>
							{data.items.map((item) => (
								<SlackRow key={item.id} item={item} spareMin={data.spareMin} now={now} />
							))}
						</ol>
					)
				}
			</QueryState>
		</div>
	);
}
