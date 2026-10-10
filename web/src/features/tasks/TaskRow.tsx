import { Link } from "wouter";
import { DueLabel } from "../../components/DueLabel";
import { formatJstDateTime } from "../../lib/date";
import type { Course, Task } from "../../lib/queries";
import { formatDuration } from "../../lib/time-input";
import { STATUS_LABEL } from "./status";

type Props = {
	task: Task;
	course: Course | undefined;
	now: number;
	/** 「完了したけど未提出」から 1 タップで提出済みにする */
	onSubmit?: (task: Task) => void;
	busy?: boolean;
};

/** 一覧の 1 行。完了(未提出)は黄色で目立たせ、提出済み・取り下げは薄くする */
export function TaskRow({ task, course, now, onSubmit, busy }: Props) {
	const awaitingSubmit = task.status === "done";
	const finished = task.status === "submitted" || task.status === "dismissed";
	return (
		<li
			className={`rounded-lg border p-3 ${
				awaitingSubmit
					? "border-amber-400 border-l-8 bg-amber-50"
					: finished
						? "border-gray-200 bg-white opacity-70"
						: "border-gray-300 bg-white"
			}`}
		>
			<Link href={`/tasks/${task.id}`} className="flex flex-col gap-1">
				<span className="flex items-start justify-between gap-2">
					<span className="text-base font-semibold text-gray-900">{task.title}</span>
					{task.status !== "todo" && (
						<span
							className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
								awaitingSubmit ? "bg-amber-500 text-white" : "bg-gray-200 text-gray-700"
							}`}
						>
							{STATUS_LABEL[task.status]}
						</span>
					)}
				</span>
				{finished ? (
					<span className="text-sm text-gray-600">締切 {formatJstDateTime(task.dueAt)}</span>
				) : (
					<DueLabel dueAt={task.dueAt} now={now} />
				)}
				<span className="text-xs text-gray-600">
					{[course?.name, formatDuration(task.estimateMin)].filter(Boolean).join(" ・ ")}
				</span>
			</Link>
			{awaitingSubmit && onSubmit && (
				<div className="mt-2 flex items-center gap-2">
					<span className="text-sm font-medium text-amber-900">提出した?</span>
					<button
						type="button"
						disabled={busy}
						onClick={() => onSubmit(task)}
						className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
					>
						提出済みにする
					</button>
				</div>
			)}
		</li>
	);
}
