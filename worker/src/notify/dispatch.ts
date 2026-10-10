// notifications テーブルの「送る時刻が来た pending」を FCM に流す。
// TODO(#16): 睡眠中・授業中・作業中の保留(deferred)、1日の上限、まとめ(merged)はここに足す。今は時刻が来たら全部送る
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "../db";
import { type NOTIFICATION_KINDS, notifications, pushTokens } from "../db/schema";
import type { Bindings } from "../env";
import { isFcmConfigured, type PushMessage, sendToToken } from "./fcm";

/** 1回の実行で送る FCM リクエストの上限(無料プランのサブリクエスト 50/回 から、D1 などの分を引いた値) */
const MAX_SENDS_PER_RUN = 30;
/** 一時的な失敗で再送を試す回数 */
const MAX_ATTEMPTS = 5;
/** この priority 以上は致命扱い(Urgency: high) */
const CRITICAL_PRIORITY = 2;

/** notifications.payload の形。本文は送る側(後続の issue)が入れ、送信後に sentAt などを足す */
export type NotificationPayload = {
	title?: string;
	body?: string;
	/** タップで開くパス。省略は "/" */
	url?: string;
	ttlSec?: number;
	attempts?: number;
	sentAt?: number;
	error?: string;
};

export type TokenResult = { token: string; ok: boolean; code?: string; removed?: boolean };
export type DispatchedNotification = {
	id: string;
	status: "sent" | "skipped" | "pending";
	results: TokenResult[];
};
export type DispatchSummary = { configured: boolean; notifications: DispatchedNotification[] };

const DEFAULT_TITLES: Record<(typeof NOTIFICATION_KINDS)[number], string> = {
	digest: "今日のダイジェスト",
	start: "そろそろ始めよう",
	risk: "締切が近いよ",
	critical: "至急: 締切が迫っている",
	due_change: "締切が変わった",
	submit_check: "提出した?",
	evening: "今日の振り返り",
	weekly: "今週の見通し",
	inbox: "受信箱に新着",
};

const asPayload = (p: unknown): NotificationPayload => (p && typeof p === "object" ? (p as NotificationPayload) : {});

/** 本文を作る。payload に title/body がなければ種類ごとの既定 */
function buildMessage(n: {
	id: string;
	kind: (typeof NOTIFICATION_KINDS)[number];
	priority: number;
	payload: unknown;
}): PushMessage {
	const p = asPayload(n.payload);
	const critical = n.kind === "critical" || n.priority >= CRITICAL_PRIORITY;
	return {
		title: p.title ?? DEFAULT_TITLES[n.kind],
		body: p.body ?? "",
		url: p.url ?? "/",
		notificationId: n.id,
		urgency: critical ? "high" : "normal",
		ttlSec: p.ttlSec ?? (critical ? 3 * 3600 : 3600),
	};
}

/**
 * 時刻が来た pending の通知を送る。cron とテスト送信 API から呼ぶ。
 * 同時に走る別の呼び出しと二重送信しないよう、先に status を sent にして「取った分」だけ送る。
 * `onlyIds` を指定するとその通知だけを対象にする(テスト送信用)
 */
export async function dispatchDueNotifications(
	env: Bindings,
	now: number,
	opts: { onlyIds?: string[] } = {},
): Promise<DispatchSummary> {
	if (!isFcmConfigured(env)) {
		// 設定前に貯まった通知を、後から一斉に送らないよう pending のまま残して何もしない
		console.warn("dispatch skipped: FCM_SERVICE_ACCOUNT is not set");
		return { configured: false, notifications: [] };
	}

	const db = getDb(env);
	const tokens = (await db.select({ token: pushTokens.token }).from(pushTokens)).map((t) => t.token);
	const due = and(
		eq(notifications.status, "pending"),
		lte(notifications.scheduledAt, now),
		opts.onlyIds ? inArray(notifications.id, opts.onlyIds) : undefined,
	);

	if (tokens.length === 0) {
		const rows = await db
			.update(notifications)
			.set({ status: "skipped" })
			.where(due)
			.returning({ id: notifications.id });
		return {
			configured: true,
			notifications: rows.map((r) => ({ id: r.id, status: "skipped" as const, results: [] })),
		};
	}

	// 宛先 × 通知 の送信数が上限に収まる件数だけ取る
	const limit = Math.max(1, Math.floor(MAX_SENDS_PER_RUN / tokens.length));
	const candidates = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(due)
		.orderBy(desc(notifications.priority), asc(notifications.scheduledAt))
		.limit(limit);
	if (candidates.length === 0) return { configured: true, notifications: [] };

	const claimed = await db
		.update(notifications)
		.set({ status: "sent" })
		.where(
			and(
				eq(notifications.status, "pending"),
				inArray(
					notifications.id,
					candidates.map((c) => c.id),
				),
			),
		)
		.returning();
	claimed.sort((a, b) => b.priority - a.priority || a.scheduledAt - b.scheduledAt);

	const out: DispatchedNotification[] = [];
	for (const n of claimed) {
		const message = buildMessage(n);
		const results: TokenResult[] = [];
		let transientFailure = false;
		for (const token of tokens) {
			const r = await sendToToken(env, token, message, now);
			results.push(
				r.ok
					? { token, ok: true }
					: r.reason === "error"
						? { token, ok: false, code: r.code, removed: r.removed }
						: { token, ok: false, code: "NOT_CONFIGURED" },
			);
			if (!r.ok && r.reason === "error" && r.transient) transientFailure = true;
		}

		const delivered = results.some((r) => r.ok);
		const payload = asPayload(n.payload);
		const attempts = (payload.attempts ?? 0) + 1;
		// 1台も届かず、一時的な失敗があれば次の分でやり直す。やり直さない未達は skipped(原因は payload.error)
		const retry = !delivered && transientFailure && attempts < MAX_ATTEMPTS;
		const status = retry ? "pending" : delivered ? "sent" : "skipped";
		await db
			.update(notifications)
			.set({
				status,
				payload: {
					...payload,
					attempts,
					...(retry ? {} : { sentAt: now }),
					...(!delivered && !retry ? { error: results.map((r) => r.code).join(",") } : {}),
				} satisfies NotificationPayload,
			})
			.where(eq(notifications.id, n.id));
		out.push({ id: n.id, status, results });
	}
	return { configured: true, notifications: out };
}
