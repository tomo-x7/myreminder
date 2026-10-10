import { useState } from "react";
import { Link } from "wouter";
import { DueLabel } from "../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice, QueryState } from "../components/ui";
import { AddTaskSheet } from "../features/tasks/AddTaskSheet";
import { isOpen } from "../features/tasks/status";
import { formatJstDateTime } from "../lib/date";
import { type Course, type Task, useCourses, useTasks, useUpdateTask } from "../lib/queries";
import { formatDuration } from "../lib/time-input";
import { useNow } from "../lib/use-now";

// TODO(#18): 「次の1件」は今は締切が一番近い未完了のタスク。#18 で /api/schedule のプランナーの推薦に切り替える
function pickNext(tasks: readonly Task[]): Task | undefined {
	return tasks.filter(isOpen).sort((a, b) => a.dueAt - b.dueAt)[0];
}

function NextCard({ task, course, now }: { task: Task; course: Course | undefined; now: number }) {
	const update = useUpdateTask();
	const mark = (status: "done" | "submitted") => update.mutate({ id: task.id, patch: { status } });
	return (
		<section className="flex flex-col gap-3 rounded-2xl border-2 border-gray-900 bg-white p-4 shadow-sm">
			<p className="text-sm font-bold tracking-wide text-gray-500">次にやること</p>
			<DueLabel dueAt={task.dueAt} now={now} size="lg" />
			<Link href={`/tasks/${task.id}`} className="flex flex-col gap-1">
				<span className="text-2xl leading-snug font-bold text-gray-900">{task.title}</span>
				<span className="text-sm text-gray-600">
					{[course?.name, `見積もり ${formatDuration(task.estimateMin)}`].filter(Boolean).join(" ・ ")}
				</span>
			</Link>
			{task.firstStep && (
				<p className="rounded-md bg-blue-50 px-3 py-2 text-base text-blue-900">
					<span className="font-bold">まず: </span>
					{task.firstStep}
				</p>
			)}
			{task.plannedStartAt !== null && (
				<p className="text-sm text-gray-600">着手予定 {formatJstDateTime(task.plannedStartAt)}</p>
			)}
			{update.isError && <ErrorNotice>更新できませんでした: {update.error.message}</ErrorNotice>}
			<div className="grid grid-cols-2 gap-2">
				<button type="button" disabled={update.isPending} onClick={() => mark("done")} className={btnPrimary}>
					完了
				</button>
				<button
					type="button"
					disabled={update.isPending}
					onClick={() => mark("submitted")}
					className={btnSecondary}
				>
					提出済み
				</button>
			</div>
		</section>
	);
}

function HomeBody({ tasks, courses }: { tasks: readonly Task[]; courses: readonly Course[] }) {
	const now = useNow();
	const next = pickNext(tasks);
	const otherCount = tasks.filter(isOpen).length - (next ? 1 : 0);
	const awaitingSubmit = tasks.filter((t) => t.status === "done").length;

	return (
		<div className="flex flex-col gap-4">
			{next ? (
				<NextCard task={next} course={courses.find((c) => c.id === next.courseId)} now={now} />
			) : (
				<section className="rounded-2xl border border-gray-300 bg-white p-6 text-center">
					<p className="text-xl font-bold text-gray-900">やることはありません</p>
					<p className="mt-1 text-sm text-gray-600">課題が出たら「＋ 追加」から登録しましょう</p>
				</section>
			)}

			{awaitingSubmit > 0 && (
				<Link
					href="/tasks?s=done"
					className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900"
				>
					完了したけど未提出が {awaitingSubmit} 件あります →
				</Link>
			)}

			<Link
				href="/tasks"
				className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-800"
			>
				{otherCount > 0 ? `ほかに未完了が ${otherCount} 件 →` : "一覧を見る →"}
			</Link>
		</div>
	);
}

export function HomePage() {
	const tasks = useTasks();
	const courses = useCourses();
	const [adding, setAdding] = useState(false);

	return (
		<div className="flex flex-col gap-4">
			<button type="button" onClick={() => setAdding(true)} className={`${btnPrimary} py-4 text-lg`}>
				＋ 追加
			</button>
			<QueryState query={tasks}>
				{(taskList) => <HomeBody tasks={taskList} courses={courses.data ?? []} />}
			</QueryState>
			{adding && <AddTaskSheet onClose={() => setAdding(false)} />}
		</div>
	);
}
