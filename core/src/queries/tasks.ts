import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { TaskCreate, TaskPatch } from "../api/types";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";

export const useTasks = () => {
	const api = useApi();
	return useQuery({
		queryKey: queryKeys.tasks,
		queryFn: async () => unwrap(await api.api.tasks.$get({ query: {} })),
	});
};

export const useTask = (id: string) => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.tasks, id],
		queryFn: async () => unwrap(await api.api.tasks[":id"].$get({ param: { id } })),
	});
};

/** 作業記録を付けられるタスク(却下以外) */
export type TaskOption = { id: string; title: string };

export const useTaskOptions = () => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.tasks, "options"],
		queryFn: async () =>
			(await unwrap(await api.api.tasks.$get({ query: { status: "todo,doing,done,submitted" } }))).map(
				(t): TaskOption => ({ id: t.id, title: t.title }),
			),
	});
};

export type CreateTasksInput = {
	inputs: TaskCreate[];
	/** i 番目を保存できるたびに呼ぶ。途中で失敗したときに、保存済みを再送しないための目印 */
	onSaved?: (index: number) => void;
};

export function useCreateTasks() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ inputs, onSaved }: CreateTasksInput) => {
			// 順番に保存する(途中で失敗したら、そこで止めて画面に出す)
			for (const [i, json] of inputs.entries()) {
				await unwrap(await api.api.tasks.$post({ json }));
				onSaved?.(i);
			}
		},
		// 途中まで保存できた場合も一覧を取り直す
		onSettled: () =>
			Promise.all([
				qc.invalidateQueries({ queryKey: queryKeys.tasks }),
				qc.invalidateQueries({ queryKey: queryKeys.schedule }),
			]),
	});
}

// タスクを完了・提出済み・取り下げ・削除にすると、サーバーが作業中の記録を閉じる
const TASK_SIDE_KEYS = [queryKeys.status, queryKeys.sessions] as const;

export const useUpdateTask = () => {
	const api = useApi();
	return useInvalidatingMutation(
		async ({ id, patch }: { id: string; patch: TaskPatch }) => {
			await unwrap(await api.api.tasks[":id"].$patch({ param: { id }, json: patch }));
		},
		queryKeys.tasks,
		TASK_SIDE_KEYS,
	);
};

/** 削除した本人の詳細画面が 404 を再取得しないよう、無効化は待たずに先へ進む */
export function useDeleteTask() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			await unwrap(await api.api.tasks[":id"].$delete({ param: { id } }));
		},
		onSuccess: (_, id) => {
			qc.removeQueries({ queryKey: [...queryKeys.tasks, id], exact: true });
			for (const queryKey of [queryKeys.tasks, queryKeys.schedule, ...TASK_SIDE_KEYS]) {
				void qc.invalidateQueries({ queryKey });
			}
		},
	});
}
