// 作業記録(状態・作業ログ)の時間の表示。ms で受ける。日時の表示と入力の変換は date.ts
import { MINUTE } from "./date";
import { formatDuration } from "./time-input";

const pad = (n: number) => String(n).padStart(2, "0");

/** `1h5m` / `25m`(formatDuration) */
export const fmtDuration = (ms: number): string => formatDuration(Math.round(ms / MINUTE));

/** `1:02:03`(作業中のタイマー用) */
export function fmtClock(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	return `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
