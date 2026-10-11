// 日付の表示と入力の変換。時刻はすべて epoch ms で持ち、画面には JST(+09:00 固定)で出す。
// 端末のタイムゾーンに依存しない(plan.md §3.1: 締切は `10/14(火) 23:59 ・ 3日後 ・ 今週`)
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
const JST_OFFSET = 9 * HOUR;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export type JstParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

export function jstParts(ms: number): JstParts {
	const d = new Date(ms + JST_OFFSET);
	return {
		year: d.getUTCFullYear(),
		month: d.getUTCMonth() + 1,
		day: d.getUTCDate(),
		hour: d.getUTCHours(),
		minute: d.getUTCMinutes(),
		weekday: d.getUTCDay(),
	};
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** その時刻を含む JST の日の 0:00 */
export function startOfJstDay(ms: number): number {
	return Math.floor((ms + JST_OFFSET) / DAY) * DAY - JST_OFFSET;
}

/** JST の週(月曜始まり)の月曜 0:00 */
export function startOfJstWeek(ms: number): number {
	return startOfJstDay(ms) - ((jstParts(ms).weekday + 6) % 7) * DAY;
}

/** 何週先か。今週=0、来週=1(月曜始まり) */
export function jstWeekOffset(ms: number, now: number): number {
	return Math.round((startOfJstWeek(ms) - startOfJstWeek(now)) / (7 * DAY));
}

/** 何日先か(JST のカレンダー日の差。今日=0、明日=1) */
export function jstDayDiff(ms: number, now: number): number {
	return Math.round((startOfJstDay(ms) - startOfJstDay(now)) / DAY);
}

/** `10/20(月)` */
export function formatJstDate(ms: number): string {
	const p = jstParts(ms);
	return `${p.month}/${p.day}(${WEEKDAYS[p.weekday]})`;
}

/** `10:40`。0:00〜23:59 の範囲で表示する(24:00 は出さない) */
export function formatJstTime(ms: number): string {
	const p = jstParts(ms);
	return `${p.hour}:${pad(p.minute)}`;
}

/** `10/20(月) 10:40` */
export function formatJstDateTime(ms: number): string {
	return `${formatJstDate(ms)} ${formatJstTime(ms)}`;
}

/**
 * 相対表現。
 * 過ぎていれば `期限切れ`、1時間未満は `N分後`、24時間未満は `N時間後`、
 * それ以外はカレンダー日の差で `明日` / `N日後`
 */
export function formatRelative(dueAt: number, now: number): string {
	const diff = dueAt - now;
	if (diff < 0) return "期限切れ";
	if (diff < HOUR) return `${Math.max(0, Math.floor(diff / MINUTE))}分後`;
	if (diff < DAY) return `${Math.floor(diff / HOUR)}時間後`;
	const days = jstDayDiff(dueAt, now);
	return days <= 1 ? "明日" : `${days}日後`;
}

/** `今週` / `来週`。それ以外(再来週以降・過去)は null */
export function formatWeekLabel(dueAt: number, now: number): string | null {
	const offset = jstWeekOffset(dueAt, now);
	if (dueAt < now) return null;
	if (offset === 0) return "今週";
	if (offset === 1) return "来週";
	return null;
}

export type DueParts = { date: string; time: string; relative: string; week: string | null };

export function formatDueParts(dueAt: number, now: number): DueParts {
	return {
		date: formatJstDate(dueAt),
		time: formatJstTime(dueAt),
		relative: formatRelative(dueAt, now),
		week: formatWeekLabel(dueAt, now),
	};
}

/** `10/20(月) 10:40 ・ 9日後 ・ 来週`(plan.md §2.2-2)。曜日と相対を必ず添えて日付の取り違えを防ぐ */
export function formatDue(dueAt: number, now: number): string {
	const { date, time, relative, week } = formatDueParts(dueAt, now);
	return [`${date} ${time}`, relative, week].filter(Boolean).join(" ・ ");
}

/** `<input type="datetime-local">` の値(`YYYY-MM-DDTHH:mm`)。JST で出す */
export function toDatetimeLocal(ms: number): string {
	const p = jstParts(ms);
	return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** datetime-local の値 → epoch ms(JST として解釈)。空や不正は null */
export function fromDatetimeLocal(value: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
	if (!m) return null;
	const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
	return Date.UTC(y, mo - 1, d, h, mi) - JST_OFFSET;
}
