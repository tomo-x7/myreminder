import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export type EffectiveStatus = InferResponseType<typeof api.api.status.$get, 200>;
export type SessionRow = InferResponseType<typeof api.api.sessions.$get, 200>[number];
export type SessionPatch = InferRequestType<(typeof api.api.sessions)[":id"]["$patch"]>["json"];
export type SessionCreate = InferRequestType<typeof api.api.sessions.$post>["json"];
export type SetStatusInput = InferRequestType<typeof api.api.status.$put>["json"];
export type TaskOption = { id: string; title: string };

/** API のエラー本文の `error` を message にして投げる。画面側は code で出し分ける */
export class ApiError extends Error {
	code: string;
	status: number;
	constructor(code: string, status: number) {
		super(code);
		this.code = code;
		this.status = status;
	}
}

async function unwrap<T>(res: { ok: boolean; status: number; json: () => Promise<unknown> }): Promise<T> {
	if (res.ok) return (await res.json()) as T;
	const body = (await res.json().catch(() => null)) as { error?: string } | null;
	throw new ApiError(body?.error ?? "unknown", res.status);
}

// 作業記録が変わると計画(残り・今日の作業分)も変わるので、schedule も取り直す
const invalidate = (qc: QueryClient) =>
	Promise.all([
		qc.invalidateQueries({ queryKey: ["status"] }),
		qc.invalidateQueries({ queryKey: ["sessions"] }),
		qc.invalidateQueries({ queryKey: ["schedule"] }),
	]);

/** 現在時刻。タイマー表示用 */
export function useNow(intervalMs: number): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}

export const useStatus = () =>
	useQuery({
		queryKey: ["status"],
		queryFn: async () => unwrap<EffectiveStatus>(await api.api.status.$get()),
		// 授業や睡眠で自動に切り替わるので、ときどき取り直す
		refetchInterval: 60_000,
	});

export function useSetStatus() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (json: SetStatusInput) => unwrap<EffectiveStatus>(await api.api.status.$put({ json })),
		onSuccess: () => invalidate(qc),
	});
}

/** 通知の「始める」からも使う */
export function useStartWorking() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (taskId: string) =>
			unwrap<EffectiveStatus>(await api.api.status.working.$post({ json: { taskId } })),
		onSuccess: async () => {
			await invalidate(qc);
			await qc.invalidateQueries({ queryKey: ["tasks"] });
		},
	});
}

export function useStopWorking() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (json: { progress: 0 | 25 | 50 | 75 | 100; endAt?: number }) =>
			unwrap<EffectiveStatus>(await api.api.status.working.stop.$post({ json })),
		onSuccess: () => invalidate(qc),
	});
}

export const useReviewSessions = () =>
	useQuery({
		queryKey: ["sessions", "review"],
		queryFn: async () => unwrap<SessionRow[]>(await api.api.sessions.review.$get()),
	});

export const useSessions = (from: number, to: number) =>
	useQuery({
		queryKey: ["sessions", "list", from, to],
		queryFn: async () =>
			unwrap<SessionRow[]>(await api.api.sessions.$get({ query: { from: String(from), to: String(to) } })),
	});

export function useUpdateSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (v: { id: string; patch: SessionPatch }) =>
			unwrap<SessionRow>(await api.api.sessions[":id"].$patch({ param: { id: v.id }, json: v.patch })),
		onSuccess: () => invalidate(qc),
	});
}

export function useCreateSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (json: SessionCreate) => unwrap<SessionRow>(await api.api.sessions.$post({ json })),
		onSuccess: () => invalidate(qc),
	});
}

export function useDeleteSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) =>
			unwrap<{ ok: true }>(await api.api.sessions[":id"].$delete({ param: { id } })),
		onSuccess: () => invalidate(qc),
	});
}

/** 作業記録を付けられるタスク(却下以外) */
export const useTaskOptions = () =>
	useQuery({
		queryKey: ["tasks", "options"],
		queryFn: async () =>
			(
				await unwrap<TaskOption[]>(await api.api.tasks.$get({ query: { status: "todo,doing,done,submitted" } }))
			).map((t) => ({
				id: t.id,
				title: t.title,
			})),
	});

const ERROR_TEXT: Record<string, string> = {
	overlap: "ほかの作業記録と時間が重なっています",
	invalid_range: "終了は開始より後にしてください",
	invalid_end_at: "終わった時刻は、開始から今までの間にしてください",
	invalid_task: "タスクが見つかりません",
	not_working: "作業中ではありません",
	working: "作業中です。先に作業を終えてください",
	task_closed: "提出済み・取り下げのタスクでは作業を始められません",
	invalid_until: "期限が過ぎています",
	not_found: "見つかりません",
};

export const errorText = (e: unknown): string =>
	e instanceof ApiError ? (ERROR_TEXT[e.code] ?? `エラー: ${e.code}`) : "通信に失敗しました";
