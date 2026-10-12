// 繰り返し(シリーズ)。仕様: ai-docs/specs/recurrence.md
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { RepeatInput } from "../api/types";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";

/** すべてのシリーズ(止めたものも含む)。enabled=false なら取らない(繰り返しのないタスクの編集画面) */
export const useSeries = (enabled = true) => {
	const api = useApi();
	return useQuery({
		queryKey: queryKeys.series,
		queryFn: async () => unwrap(await api.api.series.$get()),
		enabled,
	});
};

/** 以降を止める。afterIndex より後の未着手の回が消えるので、タスクも取り直す(schedule は共通で取り直される) */
export const useStopSeries = () => {
	const api = useApi();
	return useInvalidatingMutation(
		async ({ id, afterIndex }: { id: string; afterIndex?: number }) =>
			unwrap(await api.api.series[":id"].stop.$post({ param: { id }, json: { afterIndex } })),
		queryKeys.series,
		[queryKeys.tasks],
	);
};

/** 既存のタスクを最初の回にして繰り返しを付ける。先の回が作られるのでタスクも取り直す */
export const useRepeatTask = () => {
	const api = useApi();
	return useInvalidatingMutation(
		async ({ id, repeat }: { id: string; repeat: RepeatInput }) =>
			unwrap(await api.api.tasks[":id"].repeat.$post({ param: { id }, json: repeat })),
		queryKeys.series,
		[queryKeys.tasks],
	);
};
