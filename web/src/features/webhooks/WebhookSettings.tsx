import { useState } from "react";
import { btnDanger, btnPrimary, btnSecondary, ErrorNotice, Field, inputClass, QueryState } from "../../components/ui";
import {
	useCreateWebhook,
	useDeleteWebhook,
	useTestWebhook,
	useUpdateWebhook,
	useWebhooks,
	type Webhook,
	WebhookError,
	type WebhookEvent,
	type WebhookKind,
} from "./hooks";

const KIND_LABEL: Record<WebhookKind, string> = { discord: "Discord", slack: "Slack" };
const URL_HINT: Record<WebhookKind, string> = {
	discord: "https://discord.com/api/webhooks/…",
	slack: "https://hooks.slack.com/services/…",
};
const EVENTS: { value: WebhookEvent; label: string }[] = [
	{ value: "submitted", label: "提出済みにしたら報告" },
	{ value: "daily_summary", label: "その日に課題に使った時間(夜のまとめの時刻)" },
];

const URL_FORMAT_ERROR = "URL の形が違います(Discord / Slack の webhook URL を貼ってください)";

/** 画面に出すエラー文。URL の入力値は含めない */
function errorText(e: unknown): string {
	if (e instanceof WebhookError) {
		if (e.code === "invalid_webhook" || e.code === "invalid_webhook_url") return URL_FORMAT_ERROR;
		if (e.code === "not_found") return "見つかりません(削除済みかもしれません)";
		return `エラー: ${e.code}`;
	}
	return "通信に失敗しました";
}

function EventChecks({
	value,
	onChange,
	disabled,
}: {
	value: WebhookEvent[];
	onChange: (next: WebhookEvent[]) => void;
	disabled?: boolean;
}) {
	return (
		<div className="flex flex-col gap-1">
			{EVENTS.map((ev) => (
				<label key={ev.value} className="flex items-center gap-3 py-1.5 text-base text-gray-900">
					<input
						type="checkbox"
						className="h-5 w-5 shrink-0"
						disabled={disabled}
						checked={value.includes(ev.value)}
						onChange={(e) =>
							onChange(e.target.checked ? [...value, ev.value] : value.filter((x) => x !== ev.value))
						}
					/>
					{ev.label}
				</label>
			))}
		</div>
	);
}

function WebhookRow({ webhook }: { webhook: Webhook }) {
	const update = useUpdateWebhook();
	const remove = useDeleteWebhook();
	const test = useTestWebhook();
	const [confirming, setConfirming] = useState(false);
	const [replacing, setReplacing] = useState(false);
	const [newUrl, setNewUrl] = useState("");
	const busy = update.isPending || remove.isPending || test.isPending;
	const error = update.error ?? remove.error ?? test.error;
	const testError = test.data && !test.data.ok ? test.data.error : null;

	const save = (patch: { events?: WebhookEvent[]; enabled?: boolean }) => update.mutate({ id: webhook.id, patch });

	function replaceUrl() {
		const url = newUrl.trim();
		if (!url) return;
		update.mutate(
			{ id: webhook.id, patch: { url } },
			{
				onSuccess: () => {
					// URL は秘密情報なので、保存したら入力欄にも mutation の記録にも残さない
					setNewUrl("");
					setReplacing(false);
					update.reset();
					test.reset();
				},
			},
		);
	}

	return (
		<li className="flex flex-col gap-3 rounded-lg border border-gray-300 bg-white p-4">
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="text-base font-bold text-gray-900">{KIND_LABEL[webhook.kind]}</p>
					<p className="truncate font-mono text-sm text-gray-600">{webhook.maskedUrl}</p>
				</div>
				<label className="flex shrink-0 items-center gap-2 text-sm font-medium text-gray-700">
					<input
						type="checkbox"
						className="h-5 w-5"
						checked={webhook.enabled}
						disabled={busy}
						onChange={(e) => save({ enabled: e.target.checked })}
					/>
					{webhook.enabled ? "オン" : "オフ"}
				</label>
			</div>

			<EventChecks value={webhook.events} disabled={busy} onChange={(events) => save({ events })} />

			{webhook.lastError && <p className="text-sm text-red-700">前回の送信に失敗: {webhook.lastError}</p>}

			<div className="flex flex-wrap gap-2">
				<button type="button" className={btnSecondary} disabled={busy} onClick={() => test.mutate(webhook.id)}>
					{test.isPending ? "送信中…" : "テスト送信"}
				</button>
				<button
					type="button"
					className={btnSecondary}
					disabled={busy}
					onClick={() => {
						setReplacing((r) => !r);
						setNewUrl("");
						update.reset();
					}}
				>
					URL を差し替える
				</button>
			</div>
			{test.data?.ok && (
				<output className="block rounded-md bg-green-100 px-3 py-2 text-sm text-green-800">
					送信しました。{KIND_LABEL[webhook.kind]} を確認してください
				</output>
			)}
			{test.data && !test.data.ok && (
				<ErrorNotice>送信に失敗しました{testError ? `: ${testError}` : ""}</ErrorNotice>
			)}

			{replacing && (
				<form
					className="flex flex-col gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						replaceUrl();
					}}
				>
					<Field label="新しい URL" hint={`形: ${URL_HINT[webhook.kind]}`}>
						<input
							type="url"
							autoComplete="off"
							autoCapitalize="off"
							spellCheck={false}
							value={newUrl}
							maxLength={500}
							onChange={(e) => setNewUrl(e.target.value)}
							placeholder={URL_HINT[webhook.kind]}
							className={inputClass}
						/>
					</Field>
					<button type="submit" className={btnPrimary} disabled={busy || !newUrl.trim()}>
						{update.isPending ? "保存中…" : "差し替える"}
					</button>
				</form>
			)}

			{error && <ErrorNotice>{errorText(error)}</ErrorNotice>}

			{confirming ? (
				<div className="flex flex-col gap-2">
					<p className="text-sm text-gray-900">
						この {KIND_LABEL[webhook.kind]} への報告を削除します。URL も消えます。
					</p>
					<div className="grid grid-cols-2 gap-2">
						<button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>
							キャンセル
						</button>
						<button
							type="button"
							className={btnDanger}
							disabled={busy}
							onClick={() => remove.mutate(webhook.id)}
						>
							削除する
						</button>
					</div>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setConfirming(true)}
					className="self-start px-1 py-1 text-sm font-bold text-red-700"
				>
					削除
				</button>
			)}
		</li>
	);
}

function AddWebhookForm() {
	const create = useCreateWebhook();
	const [kind, setKind] = useState<WebhookKind>("discord");
	const [url, setUrl] = useState("");
	const [events, setEvents] = useState<WebhookEvent[]>(EVENTS.map((e) => e.value));

	function submit() {
		const trimmed = url.trim();
		if (!trimmed) return;
		create.mutate(
			{ kind, url: trimmed, events },
			{
				onSuccess: () => {
					// URL は秘密情報なので、保存したら入力欄にも mutation の記録にも残さない
					setUrl("");
					create.reset();
				},
			},
		);
	}

	return (
		<form
			className="flex flex-col gap-3 rounded-lg border border-gray-300 bg-white p-4"
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<p className="text-base font-bold text-gray-900">報告先を追加</p>
			<Field label="種類">
				<select
					value={kind}
					onChange={(e) => {
						setKind(e.target.value as WebhookKind);
						create.reset();
					}}
					className={inputClass}
				>
					<option value="discord">Discord</option>
					<option value="slack">Slack</option>
				</select>
			</Field>
			<Field label="webhook URL" hint={`形: ${URL_HINT[kind]}`}>
				<input
					type="url"
					autoComplete="off"
					autoCapitalize="off"
					spellCheck={false}
					value={url}
					maxLength={500}
					onChange={(e) => setUrl(e.target.value)}
					placeholder={URL_HINT[kind]}
					className={inputClass}
				/>
			</Field>
			<EventChecks value={events} onChange={setEvents} />
			{create.error && <ErrorNotice>{errorText(create.error)}</ErrorNotice>}
			<button type="submit" disabled={create.isPending || !url.trim()} className={btnPrimary}>
				{create.isPending ? "保存中…" : "追加"}
			</button>
		</form>
	);
}

/** Discord / Slack への報告(plan.md §3.11)。登録・イベントの ON/OFF・テスト送信・URL の差し替え・削除 */
export function WebhookSettings() {
	const webhooks = useWebhooks();
	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm text-gray-600">
				課題を提出済みにしたことや、その日に課題に使った時間を、Discord / Slack に送れます。URL
				は保存後は表示されません。
			</p>
			<QueryState query={webhooks}>
				{(list) => (
					<>
						{list.length === 0 ? (
							<p className="text-sm text-gray-500">まだ登録されていません</p>
						) : (
							<ul className="flex flex-col gap-3">
								{list.map((w) => (
									<WebhookRow key={w.id} webhook={w} />
								))}
							</ul>
						)}
					</>
				)}
			</QueryState>
			<AddWebhookForm />
		</div>
	);
}
