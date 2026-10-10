// busy_blocks と睡眠時間帯を、指定範囲の具体的な区間(epoch ms)に展開する
import type { busyBlocks } from "../db/schema";
import { DAY_MS, MINUTE_MS, startOfJstDay, toJstParts } from "./jst";

export type BusyBlockRow = typeof busyBlocks.$inferSelect;
export type SleepWindow = { startMin: number; endMin: number };
export type Interval = { start: number; end: number };

/** 睡眠の既定: 1:00–8:00 */
export const DEFAULT_SLEEP: SleepWindow = { startMin: 60, endMin: 480 };

/** [from, to) と重なる、繰り返し・単発の予定の区間 */
export function expandBusyBlocks(blocks: readonly BusyBlockRow[], from: number, to: number): Interval[] {
	const out: Interval[] = [];
	for (const b of blocks) {
		if (b.startAt != null && b.endAt != null) {
			if (b.endAt > from && b.startAt < to) out.push({ start: b.startAt, end: b.endAt });
			continue;
		}
		if (b.weekday == null || b.startMin == null || b.endMin == null) continue;
		for (let day = startOfJstDay(from); day < to; day += DAY_MS) {
			if (toJstParts(day).weekday !== b.weekday) continue;
			// 期間つき(学期)の外の日は除く
			if (b.dateFrom != null && day + DAY_MS <= b.dateFrom) continue;
			if (b.dateTo != null && day > b.dateTo) continue;
			const start = day + b.startMin * MINUTE_MS;
			const end = day + b.endMin * MINUTE_MS;
			if (end > from && start < to) out.push({ start, end });
		}
	}
	return out;
}

/** [from, to) と重なる睡眠の区間。start > end なら日をまたぐ */
export function expandSleep(sleep: SleepWindow, from: number, to: number): Interval[] {
	const out: Interval[] = [];
	// 前日始まりで日をまたぐ分も拾うため、1日前から数える
	for (let day = startOfJstDay(from) - DAY_MS; day < to; day += DAY_MS) {
		const start = day + sleep.startMin * MINUTE_MS;
		const end = (sleep.startMin > sleep.endMin ? day + DAY_MS : day) + sleep.endMin * MINUTE_MS;
		if (end > from && start < to) out.push({ start, end });
	}
	return out;
}
