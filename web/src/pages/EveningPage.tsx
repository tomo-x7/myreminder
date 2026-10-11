import type { PlanTask } from "core/api/types";
import { plannedText } from "core/domain/evening";
import { useNow } from "core/hooks/use-now";
import { useSchedule } from "core/queries/schedule";
import { useEveningList, useEveningTask } from "core/screens/evening";
import { useState } from "react";
import { Link } from "wouter";
import { DueLabel } from "../components/DueLabel";
import { btnPrimary, btnSecondary, Empty, ErrorNotice, listClass, PageHeader, QueryState } from "../components/ui";
import { SnoozeSheet } from "../features/schedule";

function EveningRow({
	task,
	now,
	done,
	onDone,
	onSnooze,
}: {
	task: PlanTask;
	now: number;
	done: boolean;
	onDone: () => void;
	onSnooze: () => void;
}) {
	const { finish, submit, pending, error, submitted } = useEveningTask(task, onDone);
	return (
		<li className="flex flex-col gap-1 py-2">
			<Link href={`/tasks/${task.id}`} className="flex flex-col gap-0.5">
				<span className="font-semibold">{task.title}</span>
				<DueLabel dueAt={task.dueAt} now={now} />
			</Link>
			{error && <ErrorNotice>{error}</ErrorNotice>}
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs text-sub">{plannedText(task)}</span>
				{done ? (
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold">{submitted ? "提出済み" : "完了"}</span>
						{!submitted && (
							<button type="button" disabled={pending} onClick={submit} className={btnSecondary}>
								提出済み
							</button>
						)}
					</div>
				) : (
					<div className="flex shrink-0 gap-1.5">
						<button type="button" disabled={pending} onClick={finish} className={btnPrimary}>
							終わった
						</button>
						<button type="button" onClick={onSnooze} className={btnSecondary}>
							いつに回す?
						</button>
					</div>
				)}
			</div>
		</li>
	);
}

/** 夜の確認(plan.md §3.8): 今日の予定を、終わった / いつに回す? で片付ける */
export function EveningPage() {
	const now = useNow();
	const schedule = useSchedule();
	const [snoozing, setSnoozing] = useState<PlanTask | null>(null);
	const { rows, isFinished, markFinished } = useEveningList(schedule.data?.tasks ?? [], now);

	return (
		<div className="flex flex-col gap-3">
			<PageHeader title="夜の確認" />
			<QueryState query={schedule}>
				{() =>
					rows.length === 0 ? (
						<Empty>予定なし</Empty>
					) : (
						<ul className={`${listClass} border-t`}>
							{rows.map((t) => (
								<EveningRow
									key={t.id}
									task={t}
									now={now}
									done={isFinished(t.id)}
									onDone={() => markFinished(t)}
									onSnooze={() => setSnoozing(t)}
								/>
							))}
						</ul>
					)
				}
			</QueryState>
			{snoozing && <SnoozeSheet target={snoozing} onClose={() => setSnoozing(null)} />}
		</div>
	);
}
