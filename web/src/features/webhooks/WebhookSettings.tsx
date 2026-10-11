import type { Webhook, WebhookEvent, WebhookKind } from "core/api/types";
import {
	toggleWebhookEvent,
	useAddWebhookForm,
	useWebhookEditor,
	WEBHOOK_EVENTS,
	WEBHOOK_KIND_LABEL,
	WEBHOOK_URL_HINT,
} from "core/forms/webhook";
import { useWebhooks } from "core/queries/webhooks";
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
			{WEBHOOK_EVENTS.map((ev) => (
				<label key={ev.value} className="flex items-center gap-2 py-1">
					<input
						type="checkbox"
						className="size-4 shrink-0 accent-ink"
						disabled={disabled}
						checked={value.includes(ev.value)}
						onChange={(e) => onChange(toggleWebhookEvent(value, ev.value, e.target.checked))}
					/>
					{ev.label}
				</label>
			))}
		</div>
	);
}

function WebhookRow({ webhook }: { webhook: Webhook }) {
	const editor = useWebhookEditor(webhook);
	const [confirming, setConfirming] = useState(false);
	const [replacing, setReplacing] = useState(false);
	const { busy, testResult } = editor;

	return (
		<li className="flex flex-col gap-2 py-2">
			<div className="flex items-center gap-2">
				<p className="shrink-0 font-semibold">{WEBHOOK_KIND_LABEL[webhook.kind]}</p>
				<p className="min-w-0 flex-1 truncate font-mono text-xs text-sub">{webhook.maskedUrl}</p>
				<label className="flex shrink-0 items-center gap-1.5 text-xs text-sub">
					<input
						type="checkbox"
						className="size-4 accent-ink"
						checked={webhook.enabled}
						disabled={busy}
						onChange={(e) => editor.setEnabled(e.target.checked)}
					/>
					{webhook.enabled ? "オン" : "オフ"}
				</label>
			</div>

			<EventChecks value={webhook.events} disabled={busy} onChange={editor.setEvents} />

			{webhook.lastError && <Notice tone="danger">前回の送信に失敗: {webhook.lastError}</Notice>}

			<div className="flex flex-wrap gap-1.5">
				<button type="button" className={btnSecondary} disabled={busy} onClick={editor.runTest}>
					{editor.testing ? "送信中…" : "テスト送信"}
				</button>
				<button
					type="button"
					className={btnSecondary}
					disabled={busy}
					onClick={() => {
						setReplacing((r) => !r);
						editor.resetReplace();
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
			{testResult?.ok && (
				<Notice>
					<output>送信しました。{WEBHOOK_KIND_LABEL[webhook.kind]} を確認してください</output>
				</Notice>
			)}
			{testResult && !testResult.ok && (
				<ErrorNotice>送信に失敗しました{testResult.error ? `: ${testResult.error}` : ""}</ErrorNotice>
			)}

			{replacing && (
				<form
					className="flex flex-col gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						editor.replaceUrl(() => setReplacing(false));
					}}
				>
					<Field label="新しい URL" hint={`形: ${WEBHOOK_URL_HINT[webhook.kind]}`}>
						<input
							type="url"
							autoComplete="off"
							autoCapitalize="off"
							spellCheck={false}
							value={editor.newUrl}
							maxLength={500}
							onChange={(e) => editor.setNewUrl(e.target.value)}
							placeholder={WEBHOOK_URL_HINT[webhook.kind]}
							className={inputClass}
						/>
					</Field>
					<button type="submit" className={btnSecondary} disabled={busy || !editor.hasNewUrl}>
						{editor.updating ? "保存中…" : "差し替える"}
					</button>
				</form>
			)}

			{editor.error && <ErrorNotice>{editor.error}</ErrorNotice>}

			{confirming && (
				<div className="flex flex-col gap-2">
					<p>この {WEBHOOK_KIND_LABEL[webhook.kind]} への報告を削除します。URL も消えます。</p>
					<div className="grid grid-cols-2 gap-2">
						<button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>
							キャンセル
						</button>
						<button type="button" className={btnDanger} disabled={busy} onClick={editor.remove}>
							削除する
						</button>
					</div>
				</div>
			)}
		</li>
	);
}

function AddWebhookForm() {
	const add = useAddWebhookForm();

	return (
		<form
			className="mt-1 flex flex-col gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				add.submit();
			}}
		>
			<p className="text-xs font-semibold text-sub">報告先を追加</p>
			<div className="grid grid-cols-[6.5rem_1fr] gap-2">
				<Field label="種類">
					<select
						value={add.kind}
						onChange={(e) => add.setKind(e.target.value as WebhookKind)}
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
						value={add.url}
						maxLength={500}
						onChange={(e) => add.setUrl(e.target.value)}
						placeholder={WEBHOOK_URL_HINT[add.kind]}
						className={inputClass}
					/>
				</Field>
			</div>
			<p className="text-xs text-faint">形: {WEBHOOK_URL_HINT[add.kind]}</p>
			<EventChecks value={add.events} onChange={add.setEvents} />
			{add.error && <ErrorNotice>{add.error}</ErrorNotice>}
			<button type="submit" disabled={add.pending || !add.hasUrl} className={btnSecondary}>
				{add.pending ? "保存中…" : "追加"}
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
