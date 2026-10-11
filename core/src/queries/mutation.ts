import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

/**
 * 更新系の mutation を作り、成功したらその key を無効化する。extra は同時に取り直す key
 * (タスクを動かすと、作業中のステータスや作業記録も変わる)
 */
export function useInvalidatingMutation<V, R>(
	mutationFn: (v: V) => Promise<R>,
	key: readonly unknown[],
	extra: readonly (readonly unknown[])[] = [],
) {
	const qc = useQueryClient();
	// 計画(/api/schedule)はタスク・予定・設定のどれが変わっても変わる
	return useMutation({
		mutationFn,
		onSuccess: () =>
			Promise.all([key, queryKeys.schedule, ...extra].map((queryKey) => qc.invalidateQueries({ queryKey }))),
	});
}

/** 状態・作業記録が変わったとき。作業記録が変わると計画(残り・今日の作業分)も変わるので、schedule も取り直す */
export const invalidateWorkLog = (qc: QueryClient) =>
	Promise.all([
		qc.invalidateQueries({ queryKey: queryKeys.status }),
		qc.invalidateQueries({ queryKey: queryKeys.sessions }),
		qc.invalidateQueries({ queryKey: queryKeys.schedule }),
	]);
