import { errorText } from "core/domain/errors";
import { useState } from "react";
import { Link } from "wouter";
import { DueLabel } from "../components/DueLabel";
import { btnPrimary, btnSecondary, Empty, ErrorNotice, listClass, PageHeader, QueryState } from "../components/ui";
import { type PlanTask } from "core/api/types";
import { useSchedule } from "core/queries/schedule";
import { SnoozeSheet } from "../features/schedule";
import { useUpdateTask } from "core/queries/tasks";
import { formatJstTime, startOfJstDay } from "core/domain/date";
import { useNow } from "core/hooks/use-now";

const DAY = 86_400_000;

/** 今日(JST)の予定の時刻。本人が決めた着手時刻を優先し、なければおすすめの着手時刻 */
const plannedFor = (t: PlanTask) => t.plannedStartAt ?? t.recommendedStart;

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
	const update = useUpdateTask();
	const at = plannedFor(task);
	const set = (status: "done" | "submitted") =>
		update.mutate({ id: task.id, patch: { status } }, { onSuccess: status === "done" ? onDone : undefined });
	const submitted = update.isSuccess && update.variables.patch.status === "submitted";
	return (
		<li className="flex flex-col gap-1 py-2">
			<Link href={`/tasks/${task.id}`} className="flex flex-col gap-0.5">
				<span className="font-semibold">{task.title}</span>
				<DueLabel dueAt={task.dueAt} now={now} />
			</Link>
			{update.isError && <ErrorNotice>更新できませんでした: {errorText(update.error)}</ErrorNotice>}
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs text-sub">
					{at !== null &&
						`${task.plannedStartAt !== null ? "着手予定" : "おすすめの着手"} ${formatJstTime(at)}`}
				</span>
				{done ? (
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold">
							{submitted ? "提出済みにしました" : "終わりました"}
						</span>
						{!submitted && (
							<button
								type="button"
								disabled={update.isPending}
								onClick={() => set("submitted")}
								className={btnSecondary}
							>
								提出済みにする
							</button>
						)}
					</div>
				) : (
					<div className="flex shrink-0 gap-1.5">
						<button
							type="button"
							disabled={update.isPending}
							onClick={() => set("done")}
							className={btnPrimary}
						>
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
	const [finished, setFinished] = useState<PlanTask[]>([]);
	const dayStart = startOfJstDay(now);

	return (
		<div className="flex flex-col gap-3">
			<PageHeader title="夜の確認" />
			<p className="text-xs text-sub">
				今日の予定です。終わったものは「終わった」、できなかったものは時刻を決めて回します。
			</p>
			<QueryState query={schedule}>
				{(plan) => {
					const today = plan.tasks.filter((t) => {
						const at = plannedFor(t);
						return at !== null && at >= dayStart && at < dayStart + DAY;
					});
					// 「終わった」にしたタスクは計画から消えるので、その場で見えるよう残す
					const rows = [...today, ...finished.filter((f) => !today.some((t) => t.id === f.id))];
					if (rows.length === 0) {
						return <Empty>今日の予定はありません</Empty>;
					}
					return (
						<ul className={`${listClass} border-t`}>
							{rows.map((t) => (
								<EveningRow
									key={t.id}
									task={t}
									now={now}
									done={finished.some((f) => f.id === t.id)}
									onDone={() => setFinished((f) => (f.some((x) => x.id === t.id) ? f : [...f, t]))}
									onSnooze={() => setSnoozing(t)}
								/>
							))}
						</ul>
					);
				}}
			</QueryState>
			{snoozing && <SnoozeSheet target={snoozing} onClose={() => setSnoozing(null)} />}
		</div>
	);
}
