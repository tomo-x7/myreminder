import { useTaskEditor } from "core/forms/task";
import { useNow } from "core/hooks/use-now";
import { useCourses } from "core/queries/courses";
import { useTask } from "core/queries/tasks";
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
	const editor = useTaskEditor(id);
	const [confirming, setConfirming] = useState(false);

	return (
		<div className="flex flex-col gap-3">
			<PageHeader
				title="編集"
				action={
					<Link href="/tasks" className={btnGhost}>
						← 一覧
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
							saving={editor.saving}
							error={editor.saveError}
							onSave={editor.save}
						/>
						{editor.saved && (
							<output className="block border-l-2 border-ink py-0.5 pl-2 text-xs">保存済み</output>
						)}

						<section className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
							{editor.removeError && <ErrorNotice>削除失敗: {editor.removeError}</ErrorNotice>}
							{confirming ? (
								<>
									<p className="font-medium">「{t.title}」を削除</p>
									<div className="grid grid-cols-2 gap-2">
										<button
											type="button"
											className={btnSecondary}
											onClick={() => setConfirming(false)}
										>
											やめる
										</button>
										<button
											type="button"
											className={btnDanger}
											disabled={editor.removing}
											onClick={() => editor.remove(() => navigate("/tasks", { replace: true }))}
										>
											{editor.removing ? "削除中…" : "削除"}
										</button>
									</div>
								</>
							) : (
								<button
									type="button"
									className={`${btnDanger} self-start`}
									onClick={() => setConfirming(true)}
								>
									削除
								</button>
							)}
						</section>
					</>
				)}
			</QueryState>
		</div>
	);
}
