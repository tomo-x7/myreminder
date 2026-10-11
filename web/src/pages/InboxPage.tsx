import type { Course, Inbox, Task } from "core/api/types";
import { useNow } from "core/hooks/use-now";
import { useCourses } from "core/queries/courses";
import { useInbox } from "core/queries/inbox";
import { useTasks } from "core/queries/tasks";
import { Empty, listClass, PageHeader, QueryState, SectionTitle } from "../components/ui";
import { InboxChangeCard, InboxItemCard } from "../features/inbox";

function InboxBody({ inbox, courses, tasks }: { inbox: Inbox; courses: readonly Course[]; tasks: readonly Task[] }) {
	const now = useNow();
	if (inbox.pending.length === 0 && inbox.changes.length === 0) {
		return <Empty>確認待ちなし</Empty>;
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
					<SectionTitle>変更 {inbox.changes.length}件</SectionTitle>
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
