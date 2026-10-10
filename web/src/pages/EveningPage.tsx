import { useState } from "react";
import { Link } from "wouter";
import { DueLabel } from "../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice, PageHeader, QueryState } from "../components/ui";
import { type PlanTask, SnoozeSheet, useSchedule } from "../features/schedule";
import { formatJstTime, startOfJstDay } from "../lib/date";
import { useUpdateTask } from "../lib/queries";
import { useNow } from "../lib/use-now";

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
		<li className="flex flex-col gap-2 rounded-xl border border-gray-300 bg-white p-4">
			<Link href={`/tasks/${task.id}`} className="flex flex-col gap-1">
				<span className="text-lg font-bold text-gray-900">{task.title}</span>
				<DueLabel dueAt={task.dueAt} now={now} />
				{at !== null && (
					<span className="text-sm text-gray-600">
						{task.plannedStartAt !== null ? "着手予定" : "おすすめの着手"} {formatJstTime(at)}
					</span>
				)}
			</Link>
			{update.isError && <ErrorNotice>更新できませんでした: {update.error.message}</ErrorNotice>}
			{done ? (
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold text-green-800">
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
				<div className="grid grid-cols-2 gap-2">
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
		<div className="flex flex-col gap-4">
			<PageHeader title="夜の確認" />
			<p className="text-sm text-gray-600">
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
						return (
							<p className="rounded-xl border border-gray-300 bg-white p-6 text-center text-gray-700">
								今日の予定はありません
							</p>
						);
					}
					return (
						<ul className="flex flex-col gap-3">
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
