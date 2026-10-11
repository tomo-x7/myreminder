// Discord / Slack への報告(plan.md §3.11)。
// webhook URL は秘密情報: ログにもエラーメッセージにも出さない
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { courses, sessions, settings, tasks, type WebhookEvent, webhooks as webhooksTable } from "../db/schema";
import { MINUTE } from "../planner/types";
import type { WebhookKind } from "../schemas/webhook";
import { activityDayKey, activityDayOf, activityDayStart } from "../services/planning-helpers";
import { getSettings } from "../settings";
import { formatDuration } from "./format";

const DISCORD_LIMIT = 2000;
const SLACK_LIMIT = 3000;
const TIMEOUT_MS = 10_000;
/** 無料プランのサブリクエスト上限に配慮して、1回に送る webhook の数 */
const MAX_TARGETS = 5;
const LAST_DAY_KEY = "webhook_daily_summary_last_day";

export type SendResult = { ok: boolean; status: number | null; error: string | null };

// 2h10m / 2h / 45m(定義は format.ts)
export { formatDuration };

/** 科目名があれば先頭に付ける */
export const taskLabel = (task: { title: string; courseName?: string | null }): string =>
	task.courseName ? `${task.courseName} ${task.title}` : task.title;

/** `✅ 情報倫理 レポート 提出(作業 2h10m / 見積もり 1h30m)`。作業記録がなければ作業の部分を省く */
export function formatSubmitted(
	task: { title: string; courseName?: string | null },
	actualMin: number | null,
	estimateMin: number,
): string {
	const parts: string[] = [];
	if (actualMin !== null && actualMin > 0) parts.push(`作業 ${formatDuration(actualMin)}`);
	parts.push(`見積もり ${formatDuration(estimateMin)}`);
	return `✅ ${taskLabel(task)} 提出(${parts.join(" / ")})`;
}

export type DailyRow = { title: string; courseName?: string | null; minutes: number };

/** `今日の課題時間 3h20m — 情報倫理 レポート 2h / 線形代数 演習 1h20m`。確認待ちがあれば「(未確定あり)」 */
export function formatDailySummary(rows: DailyRow[], hasUnconfirmed: boolean): string {
	const sorted = [...rows].sort((a, b) => b.minutes - a.minutes);
	const total = sorted.reduce((sum, r) => sum + r.minutes, 0);
	const detail = sorted.map((r) => `${taskLabel(r)} ${formatDuration(r.minutes)}`).join(" / ");
	const head = `今日の課題時間 ${formatDuration(total)}`;
	const text = detail ? `${head} — ${detail}` : head;
	return hasUnconfirmed ? `${text}(未確定あり)` : text;
}

/** 長すぎる本文を末尾「…」で切る */
export function truncateText(text: string, limit: number): string {
	if (text.length <= limit) return text;
	return `${text.slice(0, limit - 1)}…`;
}

// Slack の incoming webhook で & < > は制御文字。本文中のものは実体参照にする
const escapeSlack = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** 種類ごとの本文。Discord は @everyone などのメンションを無効にする */
export function buildWebhookBody(kind: WebhookKind, text: string): Record<string, unknown> {
	if (kind === "discord") {
		return { content: truncateText(text, DISCORD_LIMIT), allowed_mentions: { parse: [] } };
	}
	return { text: truncateText(escapeSlack(text), SLACK_LIMIT) };
}

/** URL をエラー文に残さない */
const redact = (message: string, url: string) => message.split(url).join("[redacted]").slice(0, 200);

export async function sendWebhook(kind: WebhookKind, url: string, text: string): Promise<SendResult> {
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(buildWebhookBody(kind, text)),
			signal: AbortSignal.timeout(TIMEOUT_MS),
			// リダイレクト先に本文を送らない
			redirect: "manual",
		});
		// 本文は読まずに捨てる
		await res.body?.cancel();
		if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, error: null };
		return { ok: false, status: res.status, error: `HTTP ${res.status}` };
	} catch (e) {
		const message = e instanceof Error ? (e.name === "TimeoutError" ? "timeout" : e.message) : String(e);
		return { ok: false, status: null, error: redact(message, url) };
	}
}

export type WebhookTarget = typeof webhooksTable.$inferSelect;

/** イベントを購読している有効な webhook(上限つき) */
async function loadTargets(db: Db, event: WebhookEvent): Promise<WebhookTarget[]> {
	const rows = await db.select().from(webhooksTable).where(eq(webhooksTable.enabled, true));
	return rows.filter((w) => w.events.includes(event)).slice(0, MAX_TARGETS);
}

/** 「すべての通知」を購読している有効な webhook(プッシュと同じ内容を一緒に送る先) */
export const loadMirrorTargets = (db: Db) => loadTargets(db, "all_notifications");

/** 宛先に送り、結果を last_error に残す。1件でも届けば true */
export async function postToTargets(db: Db, targets: WebhookTarget[], text: string): Promise<boolean> {
	const oks = await Promise.all(
		targets.map(async (w) => {
			const result = await sendWebhook(w.kind, w.url, text);
			await db
				.update(webhooksTable)
				.set({ lastError: result.ok ? null : (result.error ?? "unknown_error") })
				.where(eq(webhooksTable.id, w.id));
			return result.ok;
		}),
	);
	return oks.some(Boolean);
}

/** イベントを購読している有効な webhook に送り、結果を last_error に残す */
async function sendToSubscribers(db: Db, event: WebhookEvent, text: string): Promise<void> {
	await postToTargets(db, await loadTargets(db, event), text);
}

/**
 * プッシュの通知を webhook 向けの文面にする(タイトル・本文・開く画面の絶対 URL)。
 * 長さの上限は buildWebhookBody が種類ごとにかけるので、ここでは切らない
 */
export function formatNotificationForWebhook(
	message: { title: string; body: string; url: string },
	origin: string,
): string {
	const lines = [message.title];
	if (message.body) lines.push(message.body);
	lines.push(new URL(message.url, origin).toString());
	return lines.join("\n");
}

/**
 * 提出済みの報告。fire-and-forget で呼んでよい(例外は投げない)。
 * 作業時間は確定済みの actual 記録の合計(終了していないものは数えない)
 */
export async function notifySubmitted(db: Db, taskId: string, _now: number): Promise<void> {
	try {
		const [row] = await db
			.select({ title: tasks.title, estimateMin: tasks.estimateMin, courseName: courses.name })
			.from(tasks)
			.leftJoin(courses, eq(tasks.courseId, courses.id))
			.where(eq(tasks.id, taskId));
		if (!row) return;
		const spans = await db
			.select({ startAt: sessions.startAt, endAt: sessions.endAt })
			.from(sessions)
			.where(and(eq(sessions.taskId, taskId), eq(sessions.kind, "actual"), eq(sessions.review, "confirmed")));
		let actualMin = 0;
		for (const s of spans) {
			if (s.endAt !== null && s.endAt > s.startAt) actualMin += (s.endAt - s.startAt) / MINUTE;
		}
		await sendToSubscribers(
			db,
			"submitted",
			formatSubmitted(row, actualMin > 0 ? actualMin : null, row.estimateMin),
		);
	} catch (e) {
		// URL を含み得るものは出さない。種類だけ残す
		console.error("notifySubmitted failed", e instanceof Error ? e.name : "unknown");
	}
}

export type SummarySession = {
	startAt: number;
	endAt: number | null;
	review: string;
	taskId: string;
	title: string;
	courseName?: string | null;
};

export type SummaryDecision =
	| { action: "wait" }
	| { action: "skip" }
	| { action: "send"; rows: DailyRow[]; hasUnconfirmed: boolean };

/**
 * 活動日の中で睡眠が始まる時刻(JST 0時からの分 sleepStartMin)。睡眠なし(起床と同じ分)なら活動日の終わり。
 * 作業中の記録を待つ期限に使う
 */
export function sleepStartOfDay(dayStart: number, wakeMin: number, sleepStartMin: number): number {
	const offset = (((sleepStartMin - wakeMin) % 1440) + 1440) % 1440;
	return dayStart + (offset === 0 ? 1440 : offset) * MINUTE;
}

/**
 * 1日の報告をいま出すか。dayEnd は min(now, 活動日の終わり)。
 * - 作業中の記録が残っていれば、終わるまで待つ(giveUpAt = 睡眠の始まりを過ぎたら待たない)
 * - 確定済みの作業がなければ送らない(skip)
 */
export function decideDailySummary(
	sessions: SummarySession[],
	t: { now: number; dayStart: number; dayEnd: number; giveUpAt: number },
): SummaryDecision {
	if (t.now < t.giveUpAt && sessions.some((r) => r.endAt === null)) return { action: "wait" };

	const perTask = new Map<string, DailyRow>();
	let hasUnconfirmed = false;
	for (const r of sessions) {
		if (r.review !== "confirmed") {
			hasUnconfirmed = true;
			continue;
		}
		// 作業中は now まで。活動日の範囲に切る
		const minutes = (Math.min(r.endAt ?? t.now, t.dayEnd) - Math.max(r.startAt, t.dayStart)) / MINUTE;
		if (minutes <= 0) continue;
		const row = perTask.get(r.taskId) ?? { title: r.title, courseName: r.courseName, minutes: 0 };
		row.minutes += minutes;
		perTask.set(r.taskId, row);
	}
	if (perTask.size === 0) return { action: "skip" };
	return { action: "send", rows: [...perTask.values()], hasUnconfirmed };
}

/**
 * 1日の終わりの報告。毎分の cron から呼ぶ。
 * 活動日ごとに1回、夜のダイジェストの時刻(settings.digest.eveningMin)にその日を判定する。
 * 作業中の記録があれば終わるまで待つ(睡眠の始まりまで)。作業がなければ送らずに、その日は済みの印だけ付ける
 * (夜の時刻のあとに始めた作業を、始めたばかりの「1m」で報告しないため)
 */
export async function sendDailySummaryIfDue(db: Db, now: number): Promise<void> {
	try {
		const cfg = await getSettings(db);
		const wakeMin = cfg.sleep.endMin;
		const day = activityDayOf(now, wakeMin);
		const dayStart = activityDayStart(day, wakeMin);
		// 活動日の中で夜の時刻が来る瞬間(起床より前の時刻なら翌日の暦日側)
		const offsetMin = (((cfg.digest.eveningMin - wakeMin) % 1440) + 1440) % 1440;
		if (now < dayStart + offsetMin * MINUTE) return;

		const key = activityDayKey(day);
		const [last] = await db.select().from(settings).where(eq(settings.key, LAST_DAY_KEY));
		if (last?.value === key) return;

		const dayEnd = Math.min(now, activityDayStart(day + 1, wakeMin));
		const rows = await db
			.select({
				startAt: sessions.startAt,
				endAt: sessions.endAt,
				review: sessions.review,
				taskId: sessions.taskId,
				title: tasks.title,
				courseName: courses.name,
			})
			.from(sessions)
			.innerJoin(tasks, eq(sessions.taskId, tasks.id))
			.leftJoin(courses, eq(tasks.courseId, courses.id))
			.where(
				and(
					eq(sessions.kind, "actual"),
					sql`${sessions.startAt} < ${dayEnd}`,
					or(isNull(sessions.endAt), gt(sessions.endAt, dayStart)),
				),
			);

		const decision = decideDailySummary(rows, {
			now,
			dayStart,
			dayEnd,
			giveUpAt: sleepStartOfDay(dayStart, wakeMin, cfg.sleep.startMin),
		});
		if (decision.action === "wait") return;

		// 先に印を付ける(cron が重なっても二重に送らない)
		await db
			.insert(settings)
			.values({ key: LAST_DAY_KEY, value: key })
			.onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } });
		if (decision.action === "send") {
			await sendToSubscribers(db, "daily_summary", formatDailySummary(decision.rows, decision.hasUnconfirmed));
		}
	} catch (e) {
		console.error("sendDailySummaryIfDue failed", e instanceof Error ? e.name : "unknown");
	}
}
