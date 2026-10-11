// 受信箱(/api/inbox)。承認・紐付け・変更の反映をしたら、タスクと計画も取り直す
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { AcceptInput } from "../api/types";
import { queryKeys } from "./keys";

export const useInbox = () => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.inbox, "list"],
		queryFn: async () => unwrap(await api.api.inbox.$get()),
	});
};

/** ホームのバナー用。0件のときは何も出さない */
export const useInboxCount = () => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.inbox, "count"],
		queryFn: async () => unwrap(await api.api.inbox.count.$get()),
	});
};

/** 受信箱の更新系。失敗しても(409 のときは特に)一覧を取り直し、成功したらタスクと計画も取り直す */
function useInboxMutation<V>(mutationFn: (v: V) => Promise<unknown>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn,
		onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.inbox }),
		onSuccess: () =>
			Promise.all([
				qc.invalidateQueries({ queryKey: queryKeys.tasks }),
				qc.invalidateQueries({ queryKey: queryKeys.schedule }),
			]),
	});
}

export const useAcceptItem = () => {
	const api = useApi();
	return useInboxMutation(async ({ id, input }: { id: string; input: AcceptInput }) => {
		await unwrap(await api.api.inbox[":id"].accept.$post({ param: { id }, json: input }));
	});
};

export const useLinkItem = () => {
	const api = useApi();
	return useInboxMutation(async ({ id, taskId }: { id: string; taskId: string }) => {
		await unwrap(await api.api.inbox[":id"].link.$post({ param: { id }, json: { taskId } }));
	});
};

export const useIgnoreItem = () => {
	const api = useApi();
	return useInboxMutation(async (id: string) => {
		await unwrap(await api.api.inbox[":id"].ignore.$post({ param: { id } }));
	});
};

export const useAcceptChange = () => {
	const api = useApi();
	return useInboxMutation(async (id: string) => {
		await unwrap(await api.api.inbox[":id"].change.accept.$post({ param: { id } }));
	});
};

export const useDismissChange = () => {
	const api = useApi();
	return useInboxMutation(async (id: string) => {
		await unwrap(await api.api.inbox[":id"].change.dismiss.$post({ param: { id } }));
	});
};
