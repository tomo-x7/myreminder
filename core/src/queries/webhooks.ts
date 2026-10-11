import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { WebhookCreate, WebhookPatch } from "../api/types";
import { queryKeys } from "./keys";

export const useWebhooks = () => {
	const api = useApi();
	return useQuery({
		queryKey: queryKeys.webhooks,
		queryFn: async () => unwrap(await api.api.webhooks.$get()),
	});
};

export function useCreateWebhook() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (json: WebhookCreate) => {
			await unwrap(await api.api.webhooks.$post({ json }));
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.webhooks }),
	});
}

export function useUpdateWebhook() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, patch }: { id: string; patch: WebhookPatch }) => {
			await unwrap(await api.api.webhooks[":id"].$patch({ param: { id }, json: patch }));
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.webhooks }),
	});
}

export function useDeleteWebhook() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			await unwrap(await api.api.webhooks[":id"].$delete({ param: { id } }));
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.webhooks }),
	});
}

/** テスト送信。失敗した理由は lastError に保存されるので、終わったら一覧を取り直す */
export function useTestWebhook() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => unwrap(await api.api.webhooks[":id"].test.$post({ param: { id } })),
		onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.webhooks }),
	});
}
