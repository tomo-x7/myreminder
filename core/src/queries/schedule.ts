// 計画(/api/schedule)。タスクや作業記録が変わったら無効化される(tasks.ts / status.ts ほか)
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import { queryKeys } from "./keys";

export const useSchedule = () => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.schedule, "plan"],
		queryFn: async () => unwrap(await api.api.schedule.$get()),
		// 時間が進むと計画が変わるので、開いたままでもときどき取り直す
		refetchInterval: 5 * 60_000,
	});
};

/** spareMin が undefined のときはサーバーの既定(次の空き時間の長さ) */
export const useSlackList = (spareMin: number | undefined) => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.schedule, "slack", spareMin ?? "default"],
		queryFn: async () =>
			unwrap(await api.api.schedule.slack.$get({ query: spareMin ? { spareMin: String(spareMin) } : {} })),
	});
};

/** startAt まで着手しないとしたときの計画の変化 */
export const useWhatIf = (taskId: string, startAt: number | null) => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.schedule, "what-if", taskId, startAt],
		enabled: startAt !== null,
		queryFn: async () =>
			unwrap(
				await api.api.schedule["what-if"][":id"].$get({
					param: { id: taskId },
					query: { startAt: String(startAt) },
				}),
			),
	});
};
