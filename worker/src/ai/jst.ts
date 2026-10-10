// JST(+09:00 固定・夏時間なし)の変換。AI が返す "YYYY-MM-DDTHH:mm" を epoch ms にする
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const JST_OFFSET_MS = 9 * HOUR_MS;

export const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export type JstParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	/** 0=日 〜 6=土 */
	weekday: number;
};

export function toJstParts(ms: number): JstParts {
	const d = new Date(ms + JST_OFFSET_MS);
	return {
		year: d.getUTCFullYear(),
		month: d.getUTCMonth() + 1,
		day: d.getUTCDate(),
		hour: d.getUTCHours(),
		minute: d.getUTCMinutes(),
		weekday: d.getUTCDay(),
	};
}

/** JST の年月日時分 → epoch ms。hour=24 は翌日の 0 時になる(Date.UTC の繰り上がり) */
export function fromJstParts(year: number, month: number, day: number, hour = 0, minute = 0): number {
	return Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MS;
}

/** その時刻を含む JST の日の 0:00 */
export function startOfJstDay(ms: number): number {
	const p = toJstParts(ms);
	return fromJstParts(p.year, p.month, p.day);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** "YYYY-MM-DDTHH:mm"(JST、オフセットなし) */
export function formatJstDateTime(ms: number): string {
	const p = toJstParts(ms);
	return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DD" */
export function formatJstDate(ms: number): string {
	return formatJstDateTime(ms).slice(0, 10);
}

/** "2026-10-11(日) 15:30" */
export function formatJstWithWeekday(ms: number): string {
	const p = toJstParts(ms);
	return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}(${WEEKDAYS_JA[p.weekday]}) ${pad(p.hour)}:${pad(p.minute)}`;
}

/** 分(0時からの)→ "H:mm" */
export function formatMinuteOfDay(min: number): string {
	return `${Math.floor(min / 60)}:${pad(min % 60)}`;
}

const DATE_TIME_RE =
	/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?\s*(?:Z|JST|[+-]\d{2}:?\d{2})?$/i;

/**
 * AI が返した締切文字列 → epoch ms(JST として解釈)。読めなければ null。
 * - 時刻なし("2026-10-14")は 23:59
 * - 24:00 は翌日 0:00("2026-10-14T24:00" → 10/15 0:00)
 * - 末尾の Z や +09:00 は無視して JST とみなす(モデルが付けても同じ値にする)
 */
export function parseJstDateTime(input: string): number | null {
	const m = DATE_TIME_RE.exec(input.trim());
	if (!m) return null;
	const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const hasTime = m[4] !== undefined;
	const hour = hasTime ? Number(m[4]) : 23;
	const minute = hasTime ? Number(m[5]) : 59;
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return null;
	// 2月30日のような存在しない日付を弾く
	const check = new Date(Date.UTC(year, month - 1, day));
	if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
	return fromJstParts(year, month, day, hour, minute);
}

/** JST の週(月曜始まり)の月曜 0:00 */
export function startOfJstWeek(ms: number): number {
	const dayStart = startOfJstDay(ms);
	const weekday = toJstParts(ms).weekday;
	return dayStart - ((weekday + 6) % 7) * DAY_MS;
}

/** now の週を 0 として、ms が何週先か(月曜始まり) */
export function jstWeekOffset(ms: number, now: number): number {
	return Math.round((startOfJstWeek(ms) - startOfJstWeek(now)) / (7 * DAY_MS));
}
