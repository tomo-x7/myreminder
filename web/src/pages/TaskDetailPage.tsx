import { errorText } from "core/domain/errors";
import { useNow } from "core/hooks/use-now";
import { useCourses } from "core/queries/courses";
import { useDeleteTask, useTask, useUpdateTask } from "core/queries/tasks";
import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { btnDanger, btnGhost, btnSecondary, ErrorNotice, PageHeader, QueryState } from "../components/ui";
import { TaskForm } from "../features/tasks/TaskForm";

export function TaskDetailPage() {
	const { id = "" } = useParams<{ id: string }>();
	const [, navigate] = useLocation();
	const now = useNow();
	const task = useTask(id);
	const courses = useCourses();
	const update = useUpdateTask();
	const remove = useDeleteTask();
	const [saved, setSaved] = useState(false);
	const [confirming, setConfirming] = useState(false);

	return (
		<div className="flex flex-col gap-3">
			<PageHeader
				title="タスクの編集"
				action={
					<Link href="/tasks" className={btnGhost}>
						← 一覧へ
					</Link>
				}
			/>
			<QueryState query={task}>
				{(t) => (
					<>
						<TaskForm
							key={t.id}
							task={t}
							courses={courses.data ?? []}
							now={now}
							saving={update.isPending}
							error={update.isError ? errorText(update.error) : null}
							onSave={(patch) => {
								setSaved(false);
								update.mutate({ id: t.id, patch }, { onSuccess: () => setSaved(true) });
							}}
						/>
						{saved && !update.isPending && (
							<output className="block border-l-2 border-ink py-0.5 pl-2 text-xs">保存しました</output>
						)}

						<section className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
							{remove.isError && (
								<ErrorNotice>削除できませんでした: {errorText(remove.error)}</ErrorNotice>
							)}
							{confirming ? (
								<>
									<p className="font-medium">「{t.title}」を削除します。元に戻せません。</p>
									<div className="grid grid-cols-2 gap-2">
										<button
											type="button"
											className={btnSecondary}
											onClick={() => setConfirming(false)}
										>
											キャンセル
										</button>
										<button
											type="button"
											className={btnDanger}
											disabled={remove.isPending}
											onClick={() =>
												remove.mutate(t.id, {
													onSuccess: () => navigate("/tasks", { replace: true }),
												})
											}
										>
											{remove.isPending ? "削除中…" : "削除する"}
										</button>
									</div>
								</>
							) : (
								<button
									type="button"
									className={`${btnDanger} self-start`}
									onClick={() => setConfirming(true)}
								>
									このタスクを削除
								</button>
							)}
						</section>
					</>
				)}
			</QueryState>
		</div>
	);
}
