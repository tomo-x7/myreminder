// 夜の確認(plan.md §3.8): 今日の予定を、終わった / いつに回す? で片付ける
import { useState } from "react";
import type { PlanTask } from "../api/types";
import { errorText } from "../domain/errors";
import { todaysTasks } from "../domain/evening";
import { useUpdateTask } from "../queries/tasks";

/** 今日の予定の並び。「終わった」にしたタスクは計画から消えるので、その場で見えるよう残す */
export function useEveningList(tasks: readonly PlanTask[], now: number) {
	const [finished, setFinished] = useState<PlanTask[]>([]);
	const today = todaysTasks(tasks, now);

	return {
		rows: [...today, ...finished.filter((f) => !today.some((t) => t.id === f.id))],
		isFinished: (id: string) => finished.some((f) => f.id === id),
		markFinished: (task: PlanTask) => setFinished((fs) => (fs.some((f) => f.id === task.id) ? fs : [...fs, task])),
	};
}

/** 1件の「終わった」「提出済みにする」。終わったら onDone(一覧に残す) */
export function useEveningTask(task: PlanTask, onDone: () => void) {
	const update = useUpdateTask();
	const set = (status: "done" | "submitted") =>
		update.mutate({ id: task.id, patch: { status } }, { onSuccess: status === "done" ? onDone : undefined });

	return {
		finish: () => set("done"),
		submit: () => set("submitted"),
		pending: update.isPending,
		error: update.isError ? errorText(update.error) : null,
		/** 提出済みにできた */
		submitted: update.isSuccess && update.variables.patch.status === "submitted",
	};
}
