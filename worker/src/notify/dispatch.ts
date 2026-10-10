// notifications テーブルの「送る時刻が来た pending」を FCM に流す。
// 送る前にステータスと上限を見る(#16): 作業中・取り込み中・おやすみは保留(deferred)、保留が明けたら1通にまとめる(merged)、
// 致命以外の個別通知は1日の上限を超えたらまとめる。判断そのものは policy.ts の純粋関数
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { startOfJstDay } from "../ai/jst";
import { type Db, getDb } from "../db";
import { type NOTIFICATION_KINDS, notifications, pushTokens, tasks } from "../db/schema";
import type { Bindings } from "../env";
import { DAY, HOUR, type Ms } from "../planner/types";
import { getEffectiveStatus } from "../services/status";
import { getSettings } from "../settings";
import { isFcmConfigured, type PushMessage, sendToToken } from "./fcm";
import {
	type AnyKind,
	appendCapped,
	capDecision,
	countsTowardDailyLimit,
	DAILY_DIGEST_KINDS,
	holdDecision,
	isDigestKind,
	isDuplicate,
	isStillWorkingRow,
	type RowLike,
	summarizeDeferred,
} from "./policy";

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
	/** replan.ts が付ける。同じ通知を作り直さないための目印 */
	dedupeKey?: string;
	/** 「まだやってる?」(status.ts)の目印。保留・上限の対象外 */
	stillWorkingSessionId?: string;
	/** 上限でまとめた通知。次のダイジェスト(なければ「通知のまとめ」)で知らせる */
	capped?: boolean;
	carriedAt?: number;
	/** 上限でまとめた通知を送る「通知のまとめ」 */
	cappedCarry?: boolean;
	/** 保留が明けて「保留中の通知」にまとめた先 */
	mergedInto?: string;
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
	// テスト送信(onlyIds)は方針を通さずそのまま送る
	const policy = !opts.onlyIds;
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

	// 宛先 × 通知 の送信数が上限に収まる件数だけ送る
	const limit = Math.max(1, Math.floor(MAX_SENDS_PER_RUN / tokens.length));
	let selected: (typeof notifications.$inferSelect)[];
	if (policy) {
		selected = await selectByPolicy(db, now, due, limit);
	} else {
		selected = await db
			.select()
			.from(notifications)
			.where(due)
			.orderBy(desc(notifications.priority), asc(notifications.scheduledAt))
			.limit(limit);
	}
	if (selected.length === 0) return { configured: true, notifications: [] };

	const claimed = await db
		.update(notifications)
		.set({ status: "sent" })
		.where(
			and(
				eq(notifications.status, "pending"),
				inArray(
					notifications.id,
					selected.map((c) => c.id),
				),
			),
		)
		.returning();
	claimed.sort((a, b) => b.priority - a.priority || a.scheduledAt - b.scheduledAt);

	const out: DispatchedNotification[] = [];
	for (const n of claimed) {
		const carried = policy && isDigestKind(n.kind) ? await takeCapped(db, now) : [];
		const message = buildMessage(
			carried.length > 0
				? {
						...n,
						payload: {
							...asPayload(n.payload),
							body: appendCapped(asPayload(n.payload).body ?? "", carried),
						},
					}
				: n,
		);
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

type Row = typeof notifications.$inferSelect;
const asRow = (r: Row): RowLike => ({
	taskId: r.taskId,
	kind: r.kind as AnyKind,
	priority: r.priority,
	payload: asPayload(r.payload),
});
/** 古くなった通知は送らない(時刻に意味がある通知が、後からまとめて届かないように) */
const STALE_MS = 6 * HOUR;
/** 保留してから、これより古いものは「保留中」にも載せない */
const DEFERRED_EXPIRY = DAY;
const TASK_BOUND_KINDS: AnyKind[] = ["start", "risk", "critical", "submit_check"];
const CHUNK = 80;

async function setStatus(
	db: Db,
	ids: string[],
	status: "skipped" | "deferred" | "merged",
	extra?: Record<string, unknown>,
) {
	for (let i = 0; i < ids.length; i += CHUNK) {
		const part = ids.slice(i, i + CHUNK);
		await db
			.update(notifications)
			.set({
				status,
				...(extra
					? {
							payload: sql`json_patch(coalesce(${notifications.payload}, '{}'), ${JSON.stringify(extra)})`,
						}
					: {}),
			})
			.where(and(inArray(notifications.id, part), inArray(notifications.status, ["pending", "deferred"])));
	}
}

/** 今日(JST)に送った通知 */
async function loadSentToday(db: Db, now: Ms): Promise<Row[]> {
	const dayStart = startOfJstDay(now);
	return db
		.select()
		.from(notifications)
		.where(
			and(
				eq(notifications.status, "sent"),
				sql`json_extract(${notifications.payload}, '$.sentAt') >= ${dayStart}`,
			),
		);
}

/**
 * 保留が明けたとき(いまのステータスが通常)に、保留中の通知を1通にまとめる。
 * ダイジェストはそのまま送り直す。1件だけならまとめず元の通知を送り直す。
 * 締切に関わるタスクが提出済みなどで閉じていたり、24時間以上前のものは捨てる
 */
async function releaseDeferred(db: Db, now: Ms): Promise<void> {
	const held = await db.select().from(notifications).where(eq(notifications.status, "deferred"));
	if (held.length === 0) return;

	const taskIds = [...new Set(held.flatMap((h) => (h.taskId ? [h.taskId] : [])))];
	const closed = new Set<string>();
	for (let i = 0; i < taskIds.length; i += CHUNK) {
		const rows = await db
			.select({ id: tasks.id })
			.from(tasks)
			.where(
				and(inArray(tasks.id, taskIds.slice(i, i + CHUNK)), inArray(tasks.status, ["submitted", "dismissed"])),
			);
		for (const r of rows) closed.add(r.id);
	}

	const drop: string[] = [];
	const digests: Row[] = [];
	const rest: Row[] = [];
	for (const h of held) {
		const stale = h.scheduledAt < now - DEFERRED_EXPIRY;
		const done = h.taskId !== null && closed.has(h.taskId) && TASK_BOUND_KINDS.includes(h.kind as AnyKind);
		if (stale || done) drop.push(h.id);
		else if (isDigestKind(h.kind)) digests.push(h);
		else rest.push(h);
	}
	await setStatus(db, drop, "skipped");

	const release = [...digests, ...(rest.length === 1 ? rest : [])];
	for (let i = 0; i < release.length; i += CHUNK) {
		await db
			.update(notifications)
			.set({ status: "pending", scheduledAt: now })
			.where(
				and(
					eq(notifications.status, "deferred"),
					inArray(
						notifications.id,
						release.slice(i, i + CHUNK).map((r) => r.id),
					),
				),
			);
	}
	if (rest.length >= 2) {
		const titles = rest.map((r) => ({ title: asPayload(r.payload).title ?? DEFAULT_TITLES[r.kind] }));
		const id = crypto.randomUUID();
		await db.insert(notifications).values({
			id,
			kind: "digest",
			priority: 0,
			scheduledAt: now,
			status: "pending",
			payload: { ...summarizeDeferred(titles), url: "/" },
		});
		await setStatus(
			db,
			rest.map((r) => r.id),
			"merged",
			{ mergedInto: id },
		);
	}
}

/**
 * 時刻が来た pending のうち、いま送るものを選ぶ。送らないものは状態を変える:
 * 古い・提出済みのタスク・重複 → skipped、ステータスで保留 → deferred、1日の上限超え → merged(capped)
 */
async function selectByPolicy(db: Db, now: Ms, due: ReturnType<typeof and>, limit: number): Promise<Row[]> {
	const [status, cfg] = await Promise.all([getEffectiveStatus(db, now), getSettings(db)]);
	if (status.mode === "normal") await releaseDeferred(db, now);

	const candidates = await db
		.select()
		.from(notifications)
		.where(due)
		.orderBy(desc(notifications.priority), asc(notifications.scheduledAt))
		.limit(200);
	if (candidates.length === 0) return [];

	const taskIds = [...new Set(candidates.flatMap((c) => (c.taskId ? [c.taskId] : [])))];
	const closed = new Set<string>();
	for (let i = 0; i < taskIds.length; i += CHUNK) {
		const rows = await db
			.select({ id: tasks.id })
			.from(tasks)
			.where(
				and(inArray(tasks.id, taskIds.slice(i, i + CHUNK)), inArray(tasks.status, ["submitted", "dismissed"])),
			);
		for (const r of rows) closed.add(r.id);
	}

	const sentToday = await loadSentToday(db, now);
	const sentRows = sentToday.map(asRow);
	let sentCount = sentRows.filter(countsTowardDailyLimit).length;

	const send: Row[] = [];
	const skip: string[] = [];
	const defer: string[] = [];
	const merge: string[] = [];
	for (const c of candidates) {
		const row = asRow(c);
		const staleOrClosed =
			(!isStillWorkingRow(row) && c.scheduledAt < now - STALE_MS && !asPayload(c.payload).attempts) ||
			(c.taskId !== null && closed.has(c.taskId) && TASK_BOUND_KINDS.includes(c.kind as AnyKind));
		if (staleOrClosed || isDuplicate(row, sentRows)) {
			skip.push(c.id);
			continue;
		}
		if (holdDecision(row, status.mode, { criticalDuringSleep: cfg.criticalDuringSleep }) === "defer") {
			defer.push(c.id);
			continue;
		}
		if (capDecision(row, sentCount, cfg.notificationDailyLimit) === "merge") {
			merge.push(c.id);
			continue;
		}
		if (send.length >= limit) continue; // 次の分に回す(状態はそのまま)
		send.push(c);
		sentRows.push(row);
		if (countsTowardDailyLimit(row)) sentCount++;
	}
	await setStatus(db, skip, "skipped");
	await setStatus(db, defer, "deferred");
	await setStatus(db, merge, "merged", { capped: true });
	if (merge.length > 0) await scheduleCombinedIfNoDigest(db, now);
	return send;
}

/** 上限でまとめた通知を、まだ来る今日のダイジェストに載せられないとき、1日1回だけ「通知のまとめ」にする */
async function scheduleCombinedIfNoDigest(db: Db, now: Ms): Promise<void> {
	const dayEnd = startOfJstDay(now) + DAY;
	const [digestLeft] = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(
			and(
				eq(notifications.status, "pending"),
				inArray(notifications.kind, [...DAILY_DIGEST_KINDS]),
				sql`${notifications.scheduledAt} > ${now} AND ${notifications.scheduledAt} < ${dayEnd}`,
			),
		)
		.limit(1);
	if (digestLeft) return;
	const [combined] = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(
			and(
				inArray(notifications.status, ["pending", "sent"]),
				sql`json_extract(${notifications.payload}, '$.cappedCarry') = 1`,
				sql`${notifications.scheduledAt} >= ${startOfJstDay(now)}`,
			),
		)
		.limit(1);
	if (combined) return;
	const capped = await uncarried(db);
	if (capped.length === 0) return;
	const { title, body } = summarizeDeferred(capped);
	await db.insert(notifications).values({
		kind: "digest",
		priority: 0,
		scheduledAt: now,
		status: "pending",
		payload: {
			title: title.replace("保留中の通知", "通知のまとめ"),
			body,
			url: "/",
			combined: true,
			cappedCarry: true,
		},
	});
	await db
		.update(notifications)
		.set({ payload: sql`json_patch(${notifications.payload}, ${JSON.stringify({ carriedAt: now })})` })
		.where(
			sql`json_extract(${notifications.payload}, '$.capped') = 1 AND json_extract(${notifications.payload}, '$.carriedAt') IS NULL`,
		);
}

async function uncarried(db: Db): Promise<{ title: string }[]> {
	const rows = await db
		.select()
		.from(notifications)
		.where(
			and(
				eq(notifications.status, "merged"),
				sql`json_extract(${notifications.payload}, '$.capped') = 1 AND json_extract(${notifications.payload}, '$.carriedAt') IS NULL`,
			),
		);
	return rows.map((r) => ({ title: asPayload(r.payload).title ?? DEFAULT_TITLES[r.kind] }));
}

/** ダイジェストに足す、上限でまとめた通知。取ったものは持ち越し済みにする */
async function takeCapped(db: Db, now: Ms): Promise<{ title: string }[]> {
	const items = await uncarried(db);
	if (items.length === 0) return items;
	await db
		.update(notifications)
		.set({ payload: sql`json_patch(${notifications.payload}, ${JSON.stringify({ carriedAt: now })})` })
		.where(
			and(
				eq(notifications.status, "merged"),
				sql`json_extract(${notifications.payload}, '$.capped') = 1 AND json_extract(${notifications.payload}, '$.carriedAt') IS NULL`,
			),
		);
	return items;
}
