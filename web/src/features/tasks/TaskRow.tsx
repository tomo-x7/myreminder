import type { Course, Task } from "core/api/types";
import { formatJstDateTime } from "core/domain/date";
import { STATUS_LABEL } from "core/domain/task-status";
import { formatDuration } from "core/domain/time-input";
import { Link } from "wouter";
import { DueLabel } from "../../components/DueLabel";
import { btnSecondary, Tag } from "../../components/ui";

type Props = {
	task: Task;
	course: Course | undefined;
	now: number;
	/** 「完了したけど未提出」から 1 タップで提出済みにする */
	onSubmit?: (task: Task) => void;
	busy?: boolean;
};

/** 一覧の 1 行。完了(未提出)は左の黄土の線と文字色で目立たせ、提出済み・取り下げは灰色にする */
export function TaskRow({ task, course, now, onSubmit, busy }: Props) {
	const awaitingSubmit = task.status === "done";
	const finished = task.status === "submitted" || task.status === "dismissed";
	return (
		<li>
			<div className={`border-l-2 pl-2 ${awaitingSubmit ? "border-warn" : "border-transparent"}`}>
				<Link href={`/tasks/${task.id}`} className="flex flex-col gap-0.5 py-2 active:bg-wash">
					<span className="flex items-center justify-between gap-2">
						<span
							className={`min-w-0 truncate font-medium ${awaitingSubmit ? "text-warn" : finished ? "text-sub" : ""}`}
						>
							{task.title}
						</span>
						{task.status !== "todo" && (
							<Tag tone={awaitingSubmit ? "warn" : "plain"}>{STATUS_LABEL[task.status]}</Tag>
						)}
					</span>
					<span className="flex flex-wrap items-baseline justify-between gap-x-3">
						{finished ? (
							<span className="text-xs text-faint">締切 {formatJstDateTime(task.dueAt)}</span>
						) : (
							<DueLabel dueAt={task.dueAt} now={now} />
						)}
						<span className={`text-xs ${finished ? "text-faint" : "text-sub"}`}>
							{[course?.name, formatDuration(task.estimateMin)].filter(Boolean).join(" ・ ")}
						</span>
					</span>
				</Link>
				{awaitingSubmit && onSubmit && (
					<div className="flex items-center gap-2 pb-2">
						<span className="text-xs text-warn">提出した?</span>
						<button
							type="button"
							disabled={busy}
							onClick={() => onSubmit(task)}
							className={`${btnSecondary} py-1 text-xs`}
						>
							提出済みにする
						</button>
					</div>
				)}
			</div>
		</li>
	);
}
