import type { Course, Plan } from "core/api/types";
import { formatJstDate, formatJstTime } from "core/domain/date";
import { homeView } from "core/domain/home";
import { useNow } from "core/hooks/use-now";
import { useCourses } from "core/queries/courses";
import { useSchedule } from "core/queries/schedule";
import { useTasks } from "core/queries/tasks";
import { type ReactNode, useState } from "react";
import { Link } from "wouter";
import { btnPrimary, listClass, QueryState } from "../components/ui";
import { useInboxTotal } from "../features/inbox";
import { NextCard, PlanAlerts } from "../features/schedule";
import { StatusSwitcher } from "../features/status";
import { AddTaskSheet } from "../features/tasks/AddTaskSheet";

/** ホーム下部の1行。左に小さな見出し、右に中身。中身がなければ見出しだけを本文の大きさで出す */
function Row({
	label,
	href,
	strong,
	children,
}: {
	label: string;
	href?: string;
	strong?: boolean;
	children?: ReactNode;
}) {
	const body = (
		<>
			{children ? (
				<>
					<span className="w-16 shrink-0 text-xs whitespace-nowrap text-sub">{label}</span>
					<span className={`min-w-0 flex-1 ${strong ? "font-semibold" : ""}`}>{children}</span>
				</>
			) : (
				<span className={`min-w-0 flex-1 ${strong ? "font-semibold" : ""}`}>{label}</span>
			)}
			{href && (
				<span aria-hidden="true" className="text-faint">
					›
				</span>
			)}
		</>
	);
	return (
		<li>
			{href ? (
				<Link href={href} className="flex items-baseline gap-2 py-2 active:bg-wash">
					{body}
				</Link>
			) : (
				<div className="flex items-baseline gap-2 py-2">{body}</div>
			)}
		</li>
	);
}

function HomeBody({ plan, courses }: { plan: Plan; courses: readonly Course[] }) {
	const now = useNow();
	const tasks = useTasks();
	const inbox = useInboxTotal();
	const { next, nextCourse, nothingToDo, awaitingSubmit, others, bottleneck, monday } = homeView(
		plan,
		tasks.data ?? [],
		courses,
		now,
	);

	return (
		<>
			{next ? (
				<NextCard task={next} course={nextCourse} now={now} />
			) : (
				// 期限切れだけが残っているときは「未完了なし」と言わない(下の期限切れの欄が主役)
				nothingToDo && <p className="border-l-2 border-line pl-3 text-sub">未完了なし</p>
			)}

			<PlanAlerts plan={plan} now={now} />

			<ul className={`${listClass} border-t`}>
				{inbox !== null && (
					<Row label="受信箱" href="/inbox" strong>
						確認待ち {inbox}件
					</Row>
				)}
				{bottleneck && (
					<Row label="山場">
						<span className={bottleneck.short ? "text-danger" : ""}>{bottleneck.text}</span>
					</Row>
				)}
				{awaitingSubmit > 0 && (
					<Row label="未提出" href="/tasks?s=done" strong>
						<span className="text-warn">{awaitingSubmit}件</span>
					</Row>
				)}
				<Row label="一覧" href="/tasks">
					{others > 0 && `ほか ${others}件`}
				</Row>
				<Row label="夜の確認" href="/evening" />
				<Row label="ふりかえり" href="/review" strong={monday} />
			</ul>
		</>
	);
}

export function HomePage() {
	const schedule = useSchedule();
	const courses = useCourses();
	const now = useNow();
	const [adding, setAdding] = useState(false);

	return (
		<div className="flex flex-col gap-3">
			<header className="flex min-h-9 items-center justify-between gap-2">
				<p className="text-base font-bold">
					{formatJstDate(now)} <span className="font-normal text-sub">{formatJstTime(now)}</span>
				</p>
				<button type="button" onClick={() => setAdding(true)} className={btnPrimary}>
					＋ 追加
				</button>
			</header>
			<StatusSwitcher compact />
			<QueryState query={schedule}>{(plan) => <HomeBody plan={plan} courses={courses.data ?? []} />}</QueryState>
			{adding && <AddTaskSheet onClose={() => setAdding(false)} />}
		</div>
	);
}
