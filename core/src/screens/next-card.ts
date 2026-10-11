// ホームの「次の1件」の操作: 始める・完了・提出済み
import type { PlanTask } from "../api/types";
import { errorText } from "../domain/errors";
import { useUpdateTask } from "../queries/tasks";
import { useStartTask } from "./start-task";

export function useNextActions(task: PlanTask) {
	const update = useUpdateTask();
	const start = useStartTask(task.id);

	return {
		start: start.start,
		working: start.working,
		startDisabled: start.disabled,
		setStatus: (status: "done" | "submitted") => update.mutate({ id: task.id, patch: { status } }),
		updating: update.isPending,
		error: update.error ? errorText(update.error) : start.error,
	};
}
