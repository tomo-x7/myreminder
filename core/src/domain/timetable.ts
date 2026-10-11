import type { BusyBlock, Settings } from "../api/types";
import { formatJstDate, formatJstDateTime, formatJstTime } from "./date";
import { formatMinuteOfDay } from "./time-input";

export type Period = Settings["timetablePeriods"][number];
export type BusyKind = BusyBlock["kind"];

export const KIND_LABEL: Record<BusyKind, string> = { class: "授業", job: "バイト", event: "予定" };
export const KIND_ORDER: readonly BusyKind[] = ["class", "job", "event"];

/** 月曜始まりで並べる(値は 0=日〜6=土) */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"] as const;

export type RecurringBlock = BusyBlock & { weekday: number; startMin: number; endMin: number };
export type OneOffBlock = BusyBlock & { startAt: number; endAt: number };

export const isRecurring = (b: BusyBlock): b is RecurringBlock =>
	b.weekday !== null && b.startMin !== null && b.endMin !== null;
export const isOneOff = (b: BusyBlock): b is OneOffBlock => b.startAt !== null && b.endAt !== null;

export const periodOf = (b: { startMin: number; endMin: number }, periods: readonly Period[]) =>
	periods.find((p) => p.startMin === b.startMin && p.endMin === b.endMin);

/** `9:00〜10:30` */
export const formatRange = (startMin: number, endMin: number) =>
	`${formatMinuteOfDay(startMin)}〜${formatMinuteOfDay(endMin)}`;

/** 期間つきの繰り返し(学期)の表示。なければ null */
export function formatSpan(b: Pick<BusyBlock, "dateFrom" | "dateTo">): string | null {
	if (b.dateFrom === null && b.dateTo === null) return null;
	const from = b.dateFrom === null ? "" : formatJstDate(b.dateFrom);
	const to = b.dateTo === null ? "" : formatJstDate(b.dateTo);
	return `${from}〜${to}`;
}

/** 単発の予定の表示。同じ日なら終了は時刻だけ */
export function formatOneOff(b: OneOffBlock): string {
	const sameDay = formatJstDate(b.startAt) === formatJstDate(b.endAt);
	return `${formatJstDateTime(b.startAt)}〜${sameDay ? formatJstTime(b.endAt) : formatJstDateTime(b.endAt)}`;
}
