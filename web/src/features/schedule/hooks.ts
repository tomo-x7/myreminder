// 計画(/api/schedule)のフック。タスクや作業記録が変わったら無効化される(queries.ts / status/hooks.ts)
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../lib/api";

export type Plan = InferResponseType<typeof api.api.schedule.$get, 200>;
export type PlanTask = Plan["tasks"][number];
export type SlackList = InferResponseType<typeof api.api.schedule.slack.$get, 200>;
export type SlackItem = SlackList["items"][number];
export type WhatIf = InferResponseType<(typeof api.api.schedule)["what-if"][":id"]["$get"], 200>;

async function json<T>(res: { ok: boolean; status: number; json: () => Promise<unknown> }): Promise<T> {
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return (await res.json()) as T;
}

export const SCHEDULE_KEY = ["schedule"] as const;

export const useSchedule = () =>
	useQuery({
		queryKey: [...SCHEDULE_KEY, "plan"],
		queryFn: async () => json<Plan>(await api.api.schedule.$get()),
		// 時間が進むと計画が変わるので、開いたままでもときどき取り直す
		refetchInterval: 5 * 60_000,
	});

/** spareMin が undefined のときはサーバーの既定(次の空き時間の長さ) */
export const useSlackList = (spareMin: number | undefined) =>
	useQuery({
		queryKey: [...SCHEDULE_KEY, "slack", spareMin ?? "default"],
		queryFn: async () =>
			json<SlackList>(
				await api.api.schedule.slack.$get({ query: spareMin ? { spareMin: String(spareMin) } : {} }),
			),
	});

/** startAt まで着手しないとしたときの計画の変化 */
export const useWhatIf = (taskId: string, startAt: number | null) =>
	useQuery({
		queryKey: [...SCHEDULE_KEY, "what-if", taskId, startAt],
		enabled: startAt !== null,
		queryFn: async () =>
			json<WhatIf>(
				await api.api.schedule["what-if"][":id"].$get({
					param: { id: taskId },
					query: { startAt: String(startAt) },
				}),
			),
	});
