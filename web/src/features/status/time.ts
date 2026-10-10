// 時刻の表示と入力の変換。JST(+09:00 固定)。端末のタイムゾーンに依存しない
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
const JST_OFFSET = 9 * HOUR;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const jst = (ms: number) => new Date(ms + JST_OFFSET);

export const startOfJstDay = (ms: number) => Math.floor((ms + JST_OFFSET) / DAY) * DAY - JST_OFFSET;

/** `4:05` */
export function fmtTime(ms: number): string {
	const d = jst(ms);
	return `${d.getUTCHours()}:${pad(d.getUTCMinutes())}`;
}

/** `10/12(月)` */
export function fmtDate(ms: number): string {
	const d = jst(ms);
	return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
}

/** `10/12(月) 4:05` */
export const fmtDateTime = (ms: number) => `${fmtDate(ms)} ${fmtTime(ms)}`;

/** `1時間05分` / `25分` */
export function fmtDuration(ms: number): string {
	const min = Math.max(0, Math.round(ms / MINUTE));
	return min >= 60 ? `${Math.floor(min / 60)}時間${pad(min % 60)}分` : `${min}分`;
}

/** `1:02:03`(作業中のタイマー用) */
export function fmtClock(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	return `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** `<input type="datetime-local">` の値 */
export function toInput(ms: number): string {
	const d = jst(ms);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** datetime-local の値 → epoch ms(JST として解釈)。空や不正は null */
export function fromInput(value: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
	if (!m) return null;
	const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
	return Date.UTC(y, mo - 1, d, h, mi) - JST_OFFSET;
}
