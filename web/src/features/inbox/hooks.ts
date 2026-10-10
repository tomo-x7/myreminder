// 受信箱(/api/inbox)のフック。承認・紐付け・変更の反映をしたら、タスクと計画も取り直す
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queries";

export type Inbox = InferResponseType<typeof api.api.inbox.$get, 200>;
export type InboxItem = Inbox["pending"][number];
export type InboxCandidate = InboxItem["candidates"][number];
export type InboxChange = Inbox["changes"][number];
export type AcceptInput = InferRequestType<(typeof api.api.inbox)[":id"]["accept"]["$post"]>["json"];

const KEY = ["inbox"] as const;

/** 画面に出す、受信箱 API の失敗の理由 */
export class InboxError extends Error {
	status: number;
	constructor(status: number) {
		super(status === 409 ? "すでに処理されています(最新の状態に更新しました)" : `HTTP ${status}`);
		this.status = status;
	}
}

type Fetched = { ok: boolean; status: number };
function assertOk(res: Fetched) {
	if (!res.ok) throw new InboxError(res.status);
}

export const useInbox = () =>
	useQuery({
		queryKey: [...KEY, "list"],
		queryFn: async () => {
			const res = await api.api.inbox.$get();
			assertOk(res);
			return res.json();
		},
	});

/** ホームのバナー用。0件のときは何も出さない */
export const useInboxCount = () =>
	useQuery({
		queryKey: [...KEY, "count"],
		queryFn: async () => {
			const res = await api.api.inbox.count.$get();
			assertOk(res);
			return res.json();
		},
	});

/** 受信箱の更新系。失敗しても(409 のときは特に)一覧を取り直し、成功したらタスクと計画も取り直す */
function useInboxMutation<V>(mutationFn: (v: V) => Promise<void>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn,
		onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
		onSuccess: () =>
			Promise.all([
				qc.invalidateQueries({ queryKey: queryKeys.tasks }),
				qc.invalidateQueries({ queryKey: ["schedule"] }),
			]),
	});
}

export const useAcceptItem = () =>
	useInboxMutation(async ({ id, input }: { id: string; input: AcceptInput }) => {
		assertOk(await api.api.inbox[":id"].accept.$post({ param: { id }, json: input }));
	});

export const useLinkItem = () =>
	useInboxMutation(async ({ id, taskId }: { id: string; taskId: string }) => {
		assertOk(await api.api.inbox[":id"].link.$post({ param: { id }, json: { taskId } }));
	});

export const useIgnoreItem = () =>
	useInboxMutation(async (id: string) => {
		assertOk(await api.api.inbox[":id"].ignore.$post({ param: { id } }));
	});

export const useAcceptChange = () =>
	useInboxMutation(async (id: string) => {
		assertOk(await api.api.inbox[":id"].change.accept.$post({ param: { id } }));
	});

export const useDismissChange = () =>
	useInboxMutation(async (id: string) => {
		assertOk(await api.api.inbox[":id"].change.dismiss.$post({ param: { id } }));
	});
