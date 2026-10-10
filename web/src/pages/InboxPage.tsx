import { PageHeader, QueryState, SectionTitle } from "../components/ui";
import { InboxChangeCard, InboxItemCard, useInbox } from "../features/inbox";
import type { Inbox } from "../features/inbox/hooks";
import { type Course, type Task, useCourses, useTasks } from "../lib/queries";
import { useNow } from "../lib/use-now";

function InboxBody({ inbox, courses, tasks }: { inbox: Inbox; courses: readonly Course[]; tasks: readonly Task[] }) {
	const now = useNow();
	if (inbox.pending.length === 0 && inbox.changes.length === 0) {
		return (
			<section className="rounded-2xl border border-gray-300 bg-white p-6 text-center">
				<p className="text-xl font-bold text-gray-900">確認待ちはありません</p>
				<p className="mt-1 text-sm text-gray-600">新しい課題が取り込まれると、ここに届きます</p>
			</section>
		);
	}
	return (
		<>
			{inbox.pending.length > 0 && (
				<section className="flex flex-col gap-2">
					<SectionTitle>承認待ち {inbox.pending.length}件</SectionTitle>
					<ul className="flex flex-col gap-3">
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
				<section className="flex flex-col gap-2">
					<SectionTitle>変更の提案 {inbox.changes.length}件</SectionTitle>
					<ul className="flex flex-col gap-3">
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
		<div className="flex flex-col gap-4">
			<PageHeader title="受信箱" />
			<QueryState query={inbox}>
				{(data) => <InboxBody inbox={data} courses={courses.data ?? []} tasks={tasks.data ?? []} />}
			</QueryState>
		</div>
	);
}
