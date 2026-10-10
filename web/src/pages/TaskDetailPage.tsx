import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { btnDanger, btnSecondary, ErrorNotice, QueryState } from "../components/ui";
import { TaskForm } from "../features/tasks/TaskForm";
import { useCourses, useDeleteTask, useTask, useUpdateTask } from "../lib/queries";
import { useNow } from "../lib/use-now";

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
		<div className="flex flex-col gap-4">
			<Link href="/tasks" className="text-sm font-medium text-blue-700">
				← 一覧へ
			</Link>
			<QueryState query={task}>
				{(t) => (
					<>
						<TaskForm
							key={t.id}
							task={t}
							courses={courses.data ?? []}
							now={now}
							saving={update.isPending}
							error={update.isError ? update.error.message : null}
							onSave={(patch) => {
								setSaved(false);
								update.mutate({ id: t.id, patch }, { onSuccess: () => setSaved(true) });
							}}
						/>
						{saved && !update.isPending && (
							<output className="block rounded-md bg-green-100 px-3 py-2 text-sm text-green-800">
								保存しました
							</output>
						)}

						<section className="mt-4 flex flex-col gap-2 border-t border-gray-200 pt-4">
							{remove.isError && <ErrorNotice>削除できませんでした: {remove.error.message}</ErrorNotice>}
							{confirming ? (
								<>
									<p className="text-sm font-medium text-gray-900">
										「{t.title}」を削除します。元に戻せません。
									</p>
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
									className="self-start px-1 py-2 text-sm font-medium text-red-600"
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
