// 作業記録(状態・作業ログ)の時間の表示。ms で受ける。日時の表示と入力の変換は date.ts
import { MINUTE } from "./date";

const pad = (n: number) => String(n).padStart(2, "0");

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
