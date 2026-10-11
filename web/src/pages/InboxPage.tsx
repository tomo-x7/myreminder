import { listClass, PageHeader, QueryState, SectionTitle } from "../components/ui";
import { useInbox } from "core/queries/inbox";
import { InboxChangeCard, InboxItemCard } from "../features/inbox";
import { type Inbox, type Course, type Task } from "core/api/types";
import { useCourses } from "core/queries/courses";
import { useTasks } from "core/queries/tasks";
import { useNow } from "core/hooks/use-now";

function InboxBody({ inbox, courses, tasks }: { inbox: Inbox; courses: readonly Course[]; tasks: readonly Task[] }) {
	const now = useNow();
	if (inbox.pending.length === 0 && inbox.changes.length === 0) {
		return (
			<div className="flex flex-col gap-0.5 py-6 text-center">
				<p className="font-semibold">確認待ちはありません</p>
				<p className="text-xs text-faint">新しい課題が取り込まれると、ここに届きます</p>
			</div>
		);
	}
	return (
		<>
			{inbox.pending.length > 0 && (
				<section className="flex flex-col">
					<SectionTitle>承認待ち {inbox.pending.length}件</SectionTitle>
					<ul className={listClass}>
						{inbox.pending.map((item) => (
							<InboxItemCard
								key={item.id}
								item={item}
								courses={courses}
								tasks={tasks}
								startSuggestions={inbox.startSuggestions}
								now={now}
							/>
						))}
					</ul>
				</section>
			)}
			{inbox.changes.length > 0 && (
				<section className="flex flex-col">
					<SectionTitle>変更の提案 {inbox.changes.length}件</SectionTitle>
					<ul className={listClass}>
						{inbox.changes.map((item) => (
							<InboxChangeCard key={item.id} item={item} now={now} />
						))}
					</ul>
				</section>
			)}
		</>
	);
}

export function InboxPage() {
	const inbox = useInbox();
	const courses = useCourses();
	const tasks = useTasks();
	return (
		<div className="flex flex-col gap-3">
			<PageHeader title="受信箱" />
			<QueryState query={inbox}>
				{(data) => <InboxBody inbox={data} courses={courses.data ?? []} tasks={tasks.data ?? []} />}
			</QueryState>
		</div>
	);
}
