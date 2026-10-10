import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../../lib/api";

export type Webhook = InferResponseType<typeof api.api.webhooks.$get, 200>[number];
export type WebhookCreate = InferRequestType<typeof api.api.webhooks.$post>["json"];
export type WebhookPatch = InferRequestType<(typeof api.api.webhooks)[":id"]["$patch"]>["json"];
export type WebhookKind = Webhook["kind"];
export type WebhookEvent = Webhook["events"][number];

const KEY = ["webhooks"] as const;

/** 画面に出す、API のエラーコードの説明。URL(秘密情報)は入れない */
export class WebhookError extends Error {
	code: string;
	constructor(code: string) {
		super(code);
		this.code = code;
	}
}

async function fail(res: { status: number; json: () => Promise<unknown> }): Promise<never> {
	const body = (await res.json().catch(() => null)) as { error?: string } | null;
	throw new WebhookError(body?.error ?? `http_${res.status}`);
}

export const useWebhooks = () =>
	useQuery({
		queryKey: KEY,
		queryFn: async () => {
			const res = await api.api.webhooks.$get();
			if (!res.ok) return fail(res);
			return res.json();
		},
	});

export function useCreateWebhook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (json: WebhookCreate) => {
			const res = await api.api.webhooks.$post({ json });
			if (!res.ok) return fail(res);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}

export function useUpdateWebhook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, patch }: { id: string; patch: WebhookPatch }) => {
			const res = await api.api.webhooks[":id"].$patch({ param: { id }, json: patch });
			if (!res.ok) return fail(res);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}

export function useDeleteWebhook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await api.api.webhooks[":id"].$delete({ param: { id } });
			if (!res.ok) return fail(res);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}

/** テスト送信。失敗した理由は lastError に保存されるので、終わったら一覧を取り直す */
export function useTestWebhook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const res = await api.api.webhooks[":id"].test.$post({ param: { id } });
			if (!res.ok) return fail(res);
			return res.json();
		},
		onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}
