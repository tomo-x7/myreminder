// 「始める」(作業中にする)。いま作業中のタスクかどうかも見る
import { errorText } from "../domain/errors";
import { useStartWorking, useStatus } from "../queries/status";

export function useStartTask(taskId: string) {
	const start = useStartWorking();
	const status = useStatus();
	const working = status.data?.mode === "working" && status.data.taskId === taskId;

	return {
		start: () => start.mutate(taskId),
		/** このタスクで作業中 */
		working,
		/** 始められない(開始の処理中か、すでに作業中) */
		disabled: start.isPending || working,
		error: start.error ? errorText(start.error) : null,
	};
}
