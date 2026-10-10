import { useState } from "react";
import { useSearchParams } from "wouter";
import { btnPrimary, ErrorNotice, PageHeader, QueryState } from "../components/ui";
import { AddTaskSheet } from "../features/tasks/AddTaskSheet";
import { FILTERS, isStatusFilter, matchesFilter, type StatusFilter } from "../features/tasks/status";
import { TaskRow } from "../features/tasks/TaskRow";
import { type Course, type Task, useCourses, useTasks, useUpdateTask } from "../lib/queries";
import { useNow } from "../lib/use-now";

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
			{update.isError && <ErrorNotice>更新できませんでした: {update.error.message}</ErrorNotice>}
			{rows.length === 0 ? (
				<p className="py-8 text-center text-sm text-gray-500">該当するタスクはありません</p>
			) : (
				<ul className="flex flex-col gap-2">
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
		<div className="flex flex-col gap-4">
			<PageHeader
				title="一覧"
				action={
					<button type="button" onClick={() => setAdding(true)} className={`${btnPrimary} px-4 py-2`}>
						＋ 追加
					</button>
				}
			/>
			<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="状態で絞り込み">
				{FILTERS.map((f) => (
					<button
						key={f.value}
						type="button"
						role="tab"
						aria-selected={filter === f.value}
						onClick={() => setParams({ s: f.value }, { replace: true })}
						className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
							filter === f.value
								? "bg-gray-900 text-white"
								: "bg-white text-gray-700 ring-1 ring-gray-300"
						}`}
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
