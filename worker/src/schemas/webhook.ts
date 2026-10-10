// webhook の入力スキーマ。URL は秘密情報なので、検証とマスクはここに集める
import * as v from "valibot";
import { WEBHOOK_EVENTS, WEBHOOK_KINDS } from "../db/schema";

export type WebhookKind = (typeof WEBHOOK_KINDS)[number];

const URL_MAX_LENGTH = 500;

// 種類ごとに許す host とパスの形。host は完全一致(SSRF 対策)
const RULES: Record<WebhookKind, { hosts: string[]; path: RegExp }> = {
	discord: { hosts: ["discord.com", "discordapp.com"], path: /^\/api\/webhooks\/\d+\/[\w-]+\/?$/ },
	slack: { hosts: ["hooks.slack.com"], path: /^\/services\/[\w]+\/[\w]+\/[\w]+\/?$/ },
};

/** kind に合った webhook URL か。Discord / Slack の公式の形だけ許す */
export function isValidWebhookUrl(kind: WebhookKind, url: string): boolean {
	if (url.length > URL_MAX_LENGTH) return false;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	const rule = RULES[kind];
	return (
		parsed.protocol === "https:" &&
		parsed.port === "" &&
		parsed.username === "" &&
		parsed.password === "" &&
		rule.hosts.includes(parsed.hostname) &&
		rule.path.test(parsed.pathname)
	);
}

/** 画面・API に返す形。host と末尾6文字だけ(例: discord.com/…AbC123)。短すぎる/壊れた値でも末尾は出しすぎない */
export function maskWebhookUrl(url: string): string {
	let host = "";
	try {
		host = new URL(url).hostname;
	} catch {
		// 壊れた値は host なしで末尾だけ
	}
	const tail = url.length > 12 ? url.slice(-6) : "";
	return `${host}/…${tail}`;
}

const eventsSchema = v.pipe(
	v.array(v.picklist(WEBHOOK_EVENTS)),
	v.maxLength(WEBHOOK_EVENTS.length),
	v.transform((events) => [...new Set(events)]),
);
const urlSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(URL_MAX_LENGTH));

export const webhookCreateSchema = v.pipe(
	v.object({
		kind: v.picklist(WEBHOOK_KINDS),
		url: urlSchema,
		events: eventsSchema,
		enabled: v.optional(v.boolean(), true),
	}),
	v.forward(
		v.check((w) => isValidWebhookUrl(w.kind, w.url), "invalid_webhook_url"),
		["url"],
	),
);
export type WebhookCreateInput = v.InferInput<typeof webhookCreateSchema>;

// url の検証は登録済みの kind が要るので、ルート側でかける
export const webhookUpdateSchema = v.object({
	url: v.optional(urlSchema),
	events: v.optional(eventsSchema),
	enabled: v.optional(v.boolean()),
});
export type WebhookUpdateInput = v.InferInput<typeof webhookUpdateSchema>;
