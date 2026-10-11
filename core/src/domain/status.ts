// ステータス(通常・作業中・取り込み中・おやすみ)の表示の規則と、手動の切り替え・作業の終了の入力
import type { EffectiveStatus, SetStatusInput } from "../api/types";
import { DAY, formatJstTime, MINUTE, startOfJstDay } from "./date";
import { formatDuration } from "./time-input";
import { fmtClock } from "./work-log";

export type StatusMode = SetStatusInput["mode"];

const MODE_TEXT: Record<string, string> = {
	normal: "通常",
	working: "作業中",
	busy: "取り込み中",
	sleep: "おやすみ",
};

/** モードの名前。知らないモードは「通常」 */
export const statusModeText = (mode: string): string => MODE_TEXT[mode] ?? "通常";

/** 手動で切り替えられるモード(作業中は作業を始めるとなる) */
export const MODE_BUTTONS: { mode: StatusMode; label: string }[] = [
	{ mode: "normal", label: "通常" },
	{ mode: "busy", label: "取り込み中" },
	{ mode: "sleep", label: "おやすみ" },
];

export type StatusPreset = { label: string; until: number | null };

/** 手動の切り替えの期限の選択肢。通常に期限なしはない(= 手動設定の解除) */
export function statusPresets(mode: StatusMode, now: number): StatusPreset[] {
	return [
		{ label: formatDuration(30), until: now + 30 * MINUTE },
		{ label: formatDuration(60), until: now + 60 * MINUTE },
		{ label: "今日中", until: startOfJstDay(now) + DAY },
		{ label: mode === "normal" ? "自動" : "期限なし", until: null },
	];
}

/** `作業中: 課題名` / `取り込み中: 授業名` */
export function statusHeadline(s: Pick<EffectiveStatus, "mode" | "taskTitle" | "label">): string {
	const text = statusModeText(s.mode);
	if (s.mode === "working" && s.taskTitle) return `${text}: ${s.taskTitle}`;
	if (s.mode === "busy" && s.label) return `${text}: ${s.label}`;
	return text;
}

/** 見出しの補足。作業中は開始時刻と経過、それ以外は期限。自動で期限もなければ空 */
export function statusDetail(s: EffectiveStatus, now: number): string {
	if (s.mode === "working" && s.openSession) {
		return `${formatJstTime(s.openSession.startAt)} ・ ${fmtClock(now - s.openSession.startAt)}`;
	}
	if (s.until) return `${formatJstTime(s.until)} まで${s.source === "auto" ? "(自動)" : ""}`;
	return s.source === "manual" ? "手動" : "";
}

/** 作業を終えるときの進捗 */
export type StopProgress = 0 | 25 | 50 | 75 | 100;

/** 「何分前に終わった」の選択肢 */
export const AGO_PRESETS = [10, 30, 60] as const;

/** 入力欄の文字列 → 何分前。整数に切り捨て、空・不正・負は 0(= 今) */
export const parseAgoMin = (value: string): number => Math.max(0, Math.floor(Number(value)) || 0);

/** 作業の終了時刻。「今」(0分前)なら指定しない(サーバーが今にする) */
export const stopEndAt = (agoMin: number, now: number): number | undefined =>
	agoMin > 0 ? now - agoMin * MINUTE : undefined;
