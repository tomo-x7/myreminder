import type { Course, Task } from "core/api/types";
import { errorText } from "core/domain/errors";
import { FILTERS, isStatusFilter, matchesFilter, type StatusFilter } from "core/domain/task-status";
import { useNow } from "core/hooks/use-now";
import { useCourses } from "core/queries/courses";
import { useTasks, useUpdateTask } from "core/queries/tasks";
import { useState } from "react";
import { useSearchParams } from "wouter";
import { btnPrimary, chipClass, Empty, ErrorNotice, listClass, PageHeader, QueryState } from "../components/ui";
import { InboxBanner } from "../features/inbox";
import { AddTaskSheet } from "../features/tasks/AddTaskSheet";
import { TaskRow } from "../features/tasks/TaskRow";

function TaskList({
	tasks,
	courses,
	filter,
}: {
	tasks: readonly Task[];
	courses: readonly Course[];
	filter: StatusFilter;
}) {
	const now = useNow();
	const update = useUpdateTask();
	const rows = tasks.filter((t) => matchesFilter(t, filter)).sort((a, b) => a.dueAt - b.dueAt);
	// 提出済みは新しい順(直近のものが上)
	if (filter === "submitted") rows.reverse();
	return (
		<>
			{update.isError && <ErrorNotice>更新できませんでした: {errorText(update.error)}</ErrorNotice>}
			{rows.length === 0 ? (
				<Empty>該当するタスクはありません</Empty>
			) : (
				<ul className={`${listClass} border-t`}>
					{rows.map((t) => (
						<TaskRow
							key={t.id}
							task={t}
							course={courses.find((c) => c.id === t.courseId)}
							now={now}
							busy={update.isPending}
							onSubmit={(task) => update.mutate({ id: task.id, patch: { status: "submitted" } })}
						/>
					))}
				</ul>
			)}
		</>
	);
}

export function TasksPage() {
	const [params, setParams] = useSearchParams();
	const raw = params.get("s");
	const filter: StatusFilter = isStatusFilter(raw) ? raw : "open";
	const tasks = useTasks();
	const courses = useCourses();
	const [adding, setAdding] = useState(false);

	return (
		<div className="flex flex-col gap-3">
			<PageHeader
				title="一覧"
				action={
					<button type="button" onClick={() => setAdding(true)} className={btnPrimary}>
						＋ 追加
					</button>
				}
			/>
			<InboxBanner />
			<div className="-mx-3 flex gap-1.5 overflow-x-auto px-3" role="tablist" aria-label="状態で絞り込み">
				{FILTERS.map((f) => (
					<button
						key={f.value}
						type="button"
						role="tab"
						aria-selected={filter === f.value}
						onClick={() => setParams({ s: f.value }, { replace: true })}
						className={chipClass(filter === f.value)}
					>
						{f.label}
					</button>
				))}
			</div>
			<QueryState query={tasks}>
				{(list) => <TaskList tasks={list} courses={courses.data ?? []} filter={filter} />}
			</QueryState>
			{adding && <AddTaskSheet onClose={() => setAdding(false)} />}
		</div>
	);
}
