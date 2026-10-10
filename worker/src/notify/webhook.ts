// Discord / Slack への報告(plan.md §3.11)。
// webhook URL は秘密情報: ログにもエラーメッセージにも出さない
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { courses, sessions, settings, tasks, type WebhookEvent, webhooks as webhooksTable } from "../db/schema";
import { MINUTE } from "../planner/types";
import type { WebhookKind } from "../schemas/webhook";
import { activityDayKey, activityDayOf, activityDayStart } from "../services/planning-helpers";
import { getSettings } from "../settings";

const DISCORD_LIMIT = 2000;
const SLACK_LIMIT = 3000;
const TIMEOUT_MS = 10_000;
/** 無料プランのサブリクエスト上限に配慮して、1回に送る webhook の数 */
const MAX_TARGETS = 5;
const LAST_DAY_KEY = "webhook_daily_summary_last_day";

export type SendResult = { ok: boolean; status: number | null; error: string | null };

/** 2h10m / 2h / 45m。分は四捨五入 */
export function formatDuration(minutes: number): string {
	const total = Math.max(0, Math.round(minutes));
	const h = Math.floor(total / 60);
	const m = total % 60;
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h${m}m`;
}

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

/** イベントを購読している有効な webhook に送り、結果を last_error に残す */
async function sendToSubscribers(db: Db, event: WebhookEvent, text: string): Promise<void> {
	const rows = await db.select().from(webhooksTable).where(eq(webhooksTable.enabled, true));
	const targets = rows.filter((w) => w.events.includes(event)).slice(0, MAX_TARGETS);
	await Promise.all(
		targets.map(async (w) => {
			const result = await sendWebhook(w.kind, w.url, text);
			await db
				.update(webhooksTable)
				.set({ lastError: result.ok ? null : (result.error ?? "unknown_error") })
				.where(eq(webhooksTable.id, w.id));
		}),
	);
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

/**
 * 1日の終わりの報告。毎分の cron から呼ぶ。
 * 活動日ごとに1回、夜のダイジェストの時刻(settings.digest.eveningMin)以降に送る。
 * その日の確定済みの作業がなければ送らない(送信済みの印も付けず、日が変わるまで毎分見る)
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

		const perTask = new Map<string, DailyRow>();
		let hasUnconfirmed = false;
		for (const r of rows) {
			if (r.review !== "confirmed") {
				hasUnconfirmed = true;
				continue;
			}
			// 作業中は now まで。活動日の範囲に切る
			const minutes = (Math.min(r.endAt ?? now, dayEnd) - Math.max(r.startAt, dayStart)) / MINUTE;
			if (minutes <= 0) continue;
			const row = perTask.get(r.taskId) ?? { title: r.title, courseName: r.courseName, minutes: 0 };
			row.minutes += minutes;
			perTask.set(r.taskId, row);
		}
		if (perTask.size === 0) return;

		// 先に印を付ける(cron が重なっても二重に送らない)
		await db
			.insert(settings)
			.values({ key: LAST_DAY_KEY, value: key })
			.onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } });
		await sendToSubscribers(db, "daily_summary", formatDailySummary([...perTask.values()], hasUnconfirmed));
	} catch (e) {
		console.error("sendDailySummaryIfDue failed", e instanceof Error ? e.name : "unknown");
	}
}
