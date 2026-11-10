import type { Course, Task } from "core/api/types";
import { taskRowView } from "core/domain/task-list";
import { Link } from "wouter";
import { DueLabel } from "../../components/DueLabel";
import { btnSecondary, Tag } from "../../components/ui";
import { QuietCompleteAction } from "./QuietCompleteAction";

type Props = {
	task: Task;
	course: Course | undefined;
	/** 繰り返しの札(毎週・隔週・毎月…)。繰り返しに属さないタスクは undefined */
	repeat?: string;
	now: number;
	/** 一覧から開始・完了を操作する */
	onStart?: (task: Task) => void;
	onComplete?: (task: Task, silent?: boolean) => void;
	working?: boolean;
	busy?: boolean;
};

/** 一覧の 1 行。完了・取り下げは控えめに表示する */
export function TaskRow({ task, course, repeat, now, onStart, onComplete, working, busy }: Props) {
	const { finished, statusLabel, closedDue, meta } = taskRowView(task, course);
	return (
		<li>
			<div className={"border-l-2 border-transparent pl-2"}>
				<Link href={`/tasks/${task.id}`} className="flex flex-col gap-0.5 py-2 active:bg-wash">
					<span className="flex items-center justify-between gap-2">
						<span className="flex min-w-0 items-center gap-1.5">
							<span className={`min-w-0 truncate font-medium ${finished ? "text-sub" : ""}`}>
								{task.title}
							</span>
							{repeat && <Tag>{repeat}</Tag>}
						</span>
						{statusLabel && <Tag tone="plain">{statusLabel}</Tag>}
					</span>
					<span className="flex flex-wrap items-baseline justify-between gap-x-3">
						{closedDue ? (
							<span className="text-xs text-faint">{closedDue}</span>
						) : (
							<DueLabel dueAt={task.dueAt} now={now} />
						)}
						<span className={`text-xs ${finished ? "text-faint" : "text-sub"}`}>{meta}</span>
					</span>
				</Link>
				{!finished && (
					<div className="flex flex-wrap items-start gap-2 pb-2">
						<button
							type="button"
							disabled={busy || working}
							onClick={() => onStart?.(task)}
							className={btnSecondary}
							aria-label={`${task.title}を開始`}
						>
							{working ? "作業中" : "開始"}
						</button>
						<button
							type="button"
							disabled={busy}
							onClick={() => onComplete?.(task)}
							className={btnSecondary}
							aria-label={`${task.title}を完了`}
						>
							完了
						</button>
						{onComplete && (
							<QuietCompleteAction
								title={task.title}
								disabled={busy}
								onComplete={() => onComplete(task, true)}
							/>
						)}
					</div>
				)}
			</div>
		</li>
	);
}
