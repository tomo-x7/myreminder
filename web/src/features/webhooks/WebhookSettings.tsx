import type { Webhook, WebhookEvent, WebhookKind } from "core/api/types";
import { errorText } from "core/domain/errors";
import {
	useCreateWebhook,
	useDeleteWebhook,
	useTestWebhook,
	useUpdateWebhook,
	useWebhooks,
} from "core/queries/webhooks";
import { useState } from "react";
import {
	btnDanger,
	btnSecondary,
	ErrorNotice,
	Field,
	inputClass,
	listClass,
	Notice,
	QueryState,
} from "../../components/ui";

const KIND_LABEL: Record<WebhookKind, string> = { discord: "Discord", slack: "Slack" };
const URL_HINT: Record<WebhookKind, string> = {
	discord: "https://discord.com/api/webhooks/…",
	slack: "https://hooks.slack.com/services/…",
};
const EVENTS: { value: WebhookEvent; label: string }[] = [
	{ value: "submitted", label: "提出済みにしたら報告" },
	{ value: "daily_summary", label: "その日に課題に使った時間(夜のまとめの時刻)" },
];

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
		<div className="flex flex-col">
			{EVENTS.map((ev) => (
				<label key={ev.value} className="flex items-center gap-2 py-1">
					<input
						type="checkbox"
						className="size-4 shrink-0 accent-ink"
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
		<li className="flex flex-col gap-2 py-2">
			<div className="flex items-center gap-2">
				<p className="shrink-0 font-semibold">{KIND_LABEL[webhook.kind]}</p>
				<p className="min-w-0 flex-1 truncate font-mono text-xs text-sub">{webhook.maskedUrl}</p>
				<label className="flex shrink-0 items-center gap-1.5 text-xs text-sub">
					<input
						type="checkbox"
						className="size-4 accent-ink"
						checked={webhook.enabled}
						disabled={busy}
						onChange={(e) => save({ enabled: e.target.checked })}
					/>
					{webhook.enabled ? "オン" : "オフ"}
				</label>
			</div>

			<EventChecks value={webhook.events} disabled={busy} onChange={(events) => save({ events })} />

			{webhook.lastError && <Notice tone="danger">前回の送信に失敗: {webhook.lastError}</Notice>}

			<div className="flex flex-wrap gap-1.5">
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
				{!confirming && (
					<button type="button" onClick={() => setConfirming(true)} className={`${btnDanger} ml-auto`}>
						削除
					</button>
				)}
			</div>
			{test.data?.ok && (
				<Notice>
					<output>送信しました。{KIND_LABEL[webhook.kind]} を確認してください</output>
				</Notice>
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
					<button type="submit" className={btnSecondary} disabled={busy || !newUrl.trim()}>
						{update.isPending ? "保存中…" : "差し替える"}
					</button>
				</form>
			)}

			{error && <ErrorNotice>{errorText(error)}</ErrorNotice>}

			{confirming && (
				<div className="flex flex-col gap-2">
					<p>この {KIND_LABEL[webhook.kind]} への報告を削除します。URL も消えます。</p>
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
			className="mt-1 flex flex-col gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<p className="text-xs font-semibold text-sub">報告先を追加</p>
			<div className="grid grid-cols-[6.5rem_1fr] gap-2">
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
				<Field label="webhook URL">
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
			</div>
			<p className="text-xs text-faint">形: {URL_HINT[kind]}</p>
			<EventChecks value={events} onChange={setEvents} />
			{create.error && <ErrorNotice>{errorText(create.error)}</ErrorNotice>}
			<button type="submit" disabled={create.isPending || !url.trim()} className={btnSecondary}>
				{create.isPending ? "保存中…" : "追加"}
			</button>
		</form>
	);
}

/** Discord / Slack への報告(plan.md §3.11)。登録・イベントの ON/OFF・テスト送信・URL の差し替え・削除 */
export function WebhookSettings() {
	const webhooks = useWebhooks();
	return (
		<div className="flex flex-col gap-2">
			<p className="text-xs text-sub">
				課題を提出済みにしたことや、その日に課題に使った時間を、Discord / Slack に送れます。URL
				は保存後は表示されません。
			</p>
			<QueryState query={webhooks}>
				{(list) => (
					<>
						{list.length === 0 ? (
							<p className="text-xs text-faint">まだ登録されていません</p>
						) : (
							<ul className={listClass}>
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
