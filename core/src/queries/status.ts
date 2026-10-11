// 本人の状態(授業・睡眠・作業中など)。作業中の開始/終了は作業記録(sessions)も変える
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { SetStatusInput } from "../api/types";
import { queryKeys } from "./keys";
import { invalidateWorkLog } from "./mutation";

export const useStatus = () => {
	const api = useApi();
	return useQuery({
		queryKey: queryKeys.status,
		queryFn: async () => unwrap(await api.api.status.$get()),
		// 授業や睡眠で自動に切り替わるので、ときどき取り直す
		refetchInterval: 60_000,
	});
};

export function useSetStatus() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (json: SetStatusInput) => unwrap(await api.api.status.$put({ json })),
		onSuccess: () => invalidateWorkLog(qc),
	});
}

/** 通知の「始める」からも使う */
export function useStartWorking() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (taskId: string) => unwrap(await api.api.status.working.$post({ json: { taskId } })),
		onSuccess: async () => {
			await invalidateWorkLog(qc);
			await qc.invalidateQueries({ queryKey: queryKeys.tasks });
		},
	});
}

export function useStopWorking() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (json: { progress: 0 | 25 | 50 | 75 | 100; endAt?: number }) =>
			unwrap(await api.api.status.working.stop.$post({ json })),
		onSuccess: () => invalidateWorkLog(qc),
	});
}
