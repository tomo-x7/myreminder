// Discord / Slack への報告(webhook)の追加フォームと、登録済みの1件の操作。
// URL は秘密情報なので、保存できたら入力欄にも mutation の記録にも残さない(一覧にはサーバーが伏せた maskedUrl だけが来る)
import { useState } from "react";
import type { Webhook, WebhookEvent, WebhookKind } from "../api/types";
import { errorText } from "../domain/errors";
import { useCreateWebhook, useDeleteWebhook, useTestWebhook, useUpdateWebhook } from "../queries/webhooks";

export const WEBHOOK_KIND_LABEL: Record<WebhookKind, string> = { discord: "Discord", slack: "Slack" };

/** URL の形のヒント(入力欄の placeholder と「形: …」) */
export const WEBHOOK_URL_HINT: Record<WebhookKind, string> = {
	discord: "https://discord.com/api/webhooks/…",
	slack: "https://hooks.slack.com/services/…",
};

export const WEBHOOK_EVENTS: { value: WebhookEvent; label: string }[] = [
	{ value: "submitted", label: "提出済みにしたら報告" },
	{ value: "daily_summary", label: "その日に課題に使った時間(夜のまとめの時刻)" },
];

/** イベントのチェックを入れる・外す */
export const toggleWebhookEvent = (
	events: readonly WebhookEvent[],
	event: WebhookEvent,
	on: boolean,
): WebhookEvent[] => (on ? [...events, event] : events.filter((x) => x !== event));

/** 報告先の追加フォーム。種類を変えたら前回のエラーは消す */
export function useAddWebhookForm() {
	const create = useCreateWebhook();
	const [kind, setKind] = useState<WebhookKind>("discord");
	const [url, setUrl] = useState("");
	const [events, setEvents] = useState<WebhookEvent[]>(WEBHOOK_EVENTS.map((e) => e.value));

	return {
		kind,
		setKind(next: WebhookKind) {
			setKind(next);
			create.reset();
		},
		url,
		setUrl,
		events,
		setEvents,
		/** URL が空のときは追加できない */
		hasUrl: url.trim() !== "",
		pending: create.isPending,
		error: create.error ? errorText(create.error) : null,
		submit() {
			const trimmed = url.trim();
			if (!trimmed) return;
			create.mutate(
				{ kind, url: trimmed, events },
				{
					onSuccess: () => {
						setUrl("");
						create.reset();
					},
				},
			);
		},
	};
}

/** 登録済みの1件: 有効・イベントの切り替え、テスト送信、URL の差し替え、削除 */
export function useWebhookEditor(webhook: Webhook) {
	const update = useUpdateWebhook();
	const remove = useDeleteWebhook();
	const test = useTestWebhook();
	const [newUrl, setNewUrl] = useState("");
	const failure = update.error ?? remove.error ?? test.error;
	const save = (patch: { events?: WebhookEvent[]; enabled?: boolean }) => update.mutate({ id: webhook.id, patch });

	return {
		busy: update.isPending || remove.isPending || test.isPending,
		updating: update.isPending,
		testing: test.isPending,
		error: failure ? errorText(failure) : null,
		/** テスト送信の結果。送っていなければ null。失敗の理由は error(なければ null) */
		testResult: test.data ? { ok: test.data.ok, error: test.data.ok ? null : (test.data.error ?? null) } : null,
		setEnabled: (enabled: boolean) => save({ enabled }),
		setEvents: (events: WebhookEvent[]) => save({ events }),
		runTest: () => test.mutate(webhook.id),
		remove: () => remove.mutate(webhook.id),
		newUrl,
		setNewUrl,
		hasNewUrl: newUrl.trim() !== "",
		/** 差し替え欄を開閉するとき。入力と前回のエラーを消す */
		resetReplace() {
			setNewUrl("");
			update.reset();
		},
		/** 差し替えられたら onDone(欄を閉じる) */
		replaceUrl(onDone: () => void) {
			const url = newUrl.trim();
			if (!url) return;
			update.mutate(
				{ id: webhook.id, patch: { url } },
				{
					onSuccess: () => {
						setNewUrl("");
						update.reset();
						test.reset();
						onDone();
					},
				},
			);
		},
	};
}
