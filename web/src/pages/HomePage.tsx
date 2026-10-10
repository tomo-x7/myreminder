import { useState } from "react";
import { Link } from "wouter";
import { btnPrimary, QueryState } from "../components/ui";
import { InboxBanner } from "../features/inbox";
import { BottleneckCard, NextCard, PlanAlerts, pickNext, useSchedule } from "../features/schedule";
import type { Plan } from "../features/schedule/hooks";
import { StatusSwitcher } from "../features/status";
import { AddTaskSheet } from "../features/tasks/AddTaskSheet";
import { type Course, useCourses, useTasks } from "../lib/queries";
import { useNow } from "../lib/use-now";

const linkClass = "rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-800";

function HomeBody({ plan, courses }: { plan: Plan; courses: readonly Course[] }) {
	const now = useNow();
	const tasks = useTasks();
	const next = pickNext(plan.tasks);
	const awaitingSubmit = (tasks.data ?? []).filter((t) => t.status === "done").length;

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

			<InboxBanner className="rounded-lg border border-blue-400 bg-blue-50 px-4 py-3 text-base font-semibold text-blue-900" />

			<BottleneckCard bottleneck={plan.bottleneck} now={now} />
			<PlanAlerts plan={plan} now={now} />

			{awaitingSubmit > 0 && (
				<Link
					href="/tasks?s=done"
					className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900"
				>
					完了したけど未提出が {awaitingSubmit} 件あります →
				</Link>
			)}

			<Link href="/tasks" className={linkClass}>
				{plan.tasks.length > 1 ? `ほかに未完了が ${plan.tasks.length - 1} 件 →` : "一覧を見る →"}
			</Link>
			<Link href="/evening" className={linkClass}>
				今日の確認(夜の確認)→
			</Link>
		</div>
	);
}

export function HomePage() {
	const schedule = useSchedule();
	const courses = useCourses();
	const [adding, setAdding] = useState(false);

	return (
		<div className="flex flex-col gap-4">
			<button type="button" onClick={() => setAdding(true)} className={`${btnPrimary} py-4 text-lg`}>
				＋ 追加
			</button>
			<StatusSwitcher compact />
			<QueryState query={schedule}>{(plan) => <HomeBody plan={plan} courses={courses.data ?? []} />}</QueryState>
			{adding && <AddTaskSheet onClose={() => setAdding(false)} />}
		</div>
	);
}
