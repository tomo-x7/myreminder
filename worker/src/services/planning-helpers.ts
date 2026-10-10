// 計画サービスの集計(純粋関数)。DB には触れない。仕様: ai-docs/specs/planner.md

import { DAY, JST_OFFSET, MINUTE, type Minutes, type Ms } from "../planner/types";
import type { DailyWork } from "../planner/usual-capacity";

/** 活動日 = 起床(wakeMin、JST 0時からの分)から次の起床まで。番号は起床した日の JST 日付(1970-01-01 = 0) */
export type ActivityDay = number;

export type SessionSpan = { startAt: Ms; endAt: Ms | null };

const wakeOf = (day: ActivityDay, wakeMin: number): Ms => day * DAY - JST_OFFSET + wakeMin * MINUTE;

/** t が属する活動日。起床前(睡眠中)は前の日に属する */
export function activityDayOf(t: Ms, wakeMin: number): ActivityDay {
	const date = Math.floor((t + JST_OFFSET) / DAY);
	return wakeOf(date, wakeMin) <= t ? date : date - 1;
}

export const activityDayStart = (day: ActivityDay, wakeMin: number): Ms => wakeOf(day, wakeMin);

/** YYYY-MM-DD(JST) */
export const activityDayKey = (day: ActivityDay): string => new Date(day * DAY).toISOString().slice(0, 10);

/** 活動日の日付(起床した日)が土日か。capacity.ts と同じ決め方 */
export function isHolidayDay(day: ActivityDay): boolean {
	const dow = (((day + 4) % 7) + 7) % 7;
	return dow === 0 || dow === 6;
}

/**
 * 区間を活動日の境界で切って、活動日ごとの作業分を足す。
 * 終了していない区間(endAt が null)は含めない。呼び出し側で確定済みのものだけ渡す
 */
export function workedMinutesByActivityDay(spans: SessionSpan[], wakeMin: number): Map<ActivityDay, Minutes> {
	const out = new Map<ActivityDay, Minutes>();
	for (const { startAt, endAt } of spans) {
		if (endAt === null || endAt <= startAt) continue;
		let day = activityDayOf(startAt, wakeMin);
		let cursor = startAt;
		while (cursor < endAt) {
			const seg = Math.min(endAt, wakeOf(day + 1, wakeMin));
			out.set(day, (out.get(day) ?? 0) + (seg - cursor) / MINUTE);
			cursor = seg;
			day++;
		}
	}
	return out;
}

/**
 * 今の活動日の作業分。[今日の起床, now] に切って数える。
 * 作業中(endAt が null)は now までを数える。呼び出し側で確認待ちは除いておく
 */
export function workedToday(spans: SessionSpan[], wakeMin: number, now: Ms): Minutes {
	const from = wakeOf(activityDayOf(now, wakeMin), wakeMin);
	let total = 0;
	for (const { startAt, endAt } of spans) {
		const s = Math.max(startAt, from);
		const e = Math.min(endAt ?? now, now);
		if (e > s) total += (e - s) / MINUTE;
	}
	return total;
}

/**
 * 普段のキャパの学習に渡す日ごとの作業時間。今日(作業の途中)は除き、昨日までを数える。
 * 作業しなかった期間でも窓が今日から数えられるよう、昨日の 0 分の行を必ず入れる
 */
export function dailyWorkForLearning(byDay: Map<ActivityDay, Minutes>, today: ActivityDay): DailyWork[] {
	const rows: DailyWork[] = [];
	for (const [day, minutes] of byDay) {
		if (day >= today) continue;
		rows.push({ day: activityDayKey(day), minutes, holiday: isHolidayDay(day) });
	}
	const yesterday = today - 1;
	if (!byDay.has(yesterday)) {
		rows.push({ day: activityDayKey(yesterday), minutes: 0, holiday: isHolidayDay(yesterday) });
	}
	return rows;
}

/** 進捗(0〜100 の整数。25/50/75/100)から残りの割合。未記録は 0%、範囲外は切る */
export function remainingFraction(progress: number | null): number {
	if (progress === null || !Number.isFinite(progress)) return 1;
	return 1 - Math.min(100, Math.max(0, progress)) / 100;
}

export type ProgressSession = { startAt: Ms; progress: number | null };

/** 開始が一番新しい、進捗の入っている作業記録の進捗。なければ null */
export function latestProgress(sessions: ProgressSession[]): number | null {
	let best: ProgressSession | null = null;
	for (const s of sessions) {
		if (s.progress === null) continue;
		if (best === null || s.startAt > best.startAt) best = s;
	}
	return best ? best.progress : null;
}

export type FinishedSession = { startAt: Ms; endAt: Ms | null; review: string };

/**
 * 見積もりの学習サンプルの実績(分)と完了時刻。
 * 確認待ちを含むタスク・確定済みの記録が1つもないタスクは null(学習に使わない)。
 * 終了していない記録は数えない
 */
export function actualForSample(sessions: FinishedSession[]): { actualMin: Minutes; completedAt: Ms } | null {
	let total = 0;
	let last = 0;
	for (const s of sessions) {
		if (s.review !== "confirmed") return null;
		if (s.endAt === null || s.endAt <= s.startAt) continue;
		total += (s.endAt - s.startAt) / MINUTE;
		last = Math.max(last, s.endAt);
	}
	return total > 0 ? { actualMin: total, completedAt: last } : null;
}
