import { type ReactNode, useState } from "react";
import { Link } from "wouter";
import { btnPrimary, listClass, QueryState } from "../components/ui";
import { useInboxTotal } from "../features/inbox";
import { bottleneckText, NextCard, PlanAlerts, pickNext, useSchedule } from "../features/schedule";
import type { Plan } from "../features/schedule/hooks";
import { StatusSwitcher } from "../features/status";
import { AddTaskSheet } from "../features/tasks/AddTaskSheet";
import { formatJstDate, formatJstTime, jstParts } from "../lib/date";
import { type Course, useCourses, useTasks } from "../lib/queries";
import { useNow } from "../lib/use-now";

/** ホーム下部の1行。左に小さな見出し、右に中身 */
function Row({
	label,
	href,
	strong,
	children,
}: {
	label: string;
	href?: string;
	strong?: boolean;
	children: ReactNode;
}) {
	const body = (
		<>
			<span className="w-16 shrink-0 text-xs whitespace-nowrap text-sub">{label}</span>
			<span className={`min-w-0 flex-1 ${strong ? "font-semibold" : ""}`}>{children}</span>
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
	const next = pickNext(plan.tasks);
	const awaitingSubmit = (tasks.data ?? []).filter((t) => t.status === "done").length;
	const others = plan.tasks.length - (next ? 1 : 0);
	const short = plan.bottleneck !== null && plan.bottleneck.slackUsual < 0;
	// 月曜は新しい週のはじまりなので、先週のふりかえりを目立たせる
	const monday = jstParts(now).weekday === 1;

	return (
		<>
			{next ? (
				<NextCard task={next} course={courses.find((c) => c.id === next.courseId)} now={now} />
			) : (
				// 期限切れだけが残っているときは「やることはない」と言わない(下の期限切れの欄が主役)
				plan.overdue.length === 0 && (
					<p className="border-l-2 border-line pl-3 text-sub">
						やることはありません。課題が出たら「＋ 追加」から登録する
					</p>
				)
			)}

			<PlanAlerts plan={plan} now={now} />

			<ul className={`${listClass} border-t`}>
				{inbox !== null && (
					<Row label="受信箱" href="/inbox" strong>
						確認待ち {inbox}件
					</Row>
				)}
				{plan.bottleneck && (
					<Row label="山場">
						<span className={short ? "text-danger" : ""}>{bottleneckText(plan.bottleneck, now)}</span>
					</Row>
				)}
				{awaitingSubmit > 0 && (
					<Row label="未提出" href="/tasks?s=done" strong>
						<span className="text-warn">完了したけど未提出 {awaitingSubmit}件</span>
					</Row>
				)}
				<Row label="一覧" href="/tasks">
					{others > 0 ? `ほかに未完了 ${others}件` : "一覧を見る"}
				</Row>
				<Row label="夜の確認" href="/evening">
					今日の予定の確認
				</Row>
				<Row label="ふりかえり" href="/review" strong={monday}>
					先週のふりかえり
				</Row>
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
