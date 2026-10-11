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

/** 90 → `1h30m`、45 → `45m`、120 → `2h`。長さの表記はこれ1つにそろえる(ai-docs/specs/ui.md の文言) */
export function formatDuration(min: number): string {
	const total = Math.max(0, Math.round(min));
	const h = Math.floor(total / 60);
	const m = total % 60;
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h${m}m`;
}
