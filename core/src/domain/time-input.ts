// 入力欄(type=time / type=date)と、設定・時間割の「JST 0時からの分」「JST の日付」との変換。date.ts の補助
import { fromDatetimeLocal, toDatetimeLocal } from "./date";

const pad = (n: number) => String(n).padStart(2, "0");

/** 540 → `9:00`(1440 は `24:00`) */
export function formatMinuteOfDay(min: number): string {
	return `${Math.floor(min / 60)}:${pad(min % 60)}`;
}

/** 540 → `09:00`(type=time の値) */
export function minuteToTimeInput(min: number): string {
	return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** `09:00` → 540。空や不正は null */
export function timeInputToMinute(value: string): number | null {
	const m = /^(\d{1,2}):(\d{2})/.exec(value);
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** JST の日付(その日の 0:00 の epoch ms)→ `2026-10-14`(type=date の値) */
export function toDateInput(ms: number): string {
	return toDatetimeLocal(ms).slice(0, 10);
}

/** `2026-10-14` → JST のその日の 0:00(epoch ms)。空や不正は null */
export function fromDateInput(value: string): number | null {
	return value ? fromDatetimeLocal(`${value}T00:00`) : null;
}

/** 90 → `1時間30分`、45 → `45分`、120 → `2時間` */
export function formatDuration(min: number): string {
	const h = Math.floor(min / 60);
	const m = min % 60;
	if (h === 0) return `${m}分`;
	return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}
