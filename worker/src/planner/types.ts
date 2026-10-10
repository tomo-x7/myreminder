// 仕様: ai-docs/specs/planner.md
// planner/ の関数はすべて純粋関数。DB・現在時刻・乱数に触れない

/** epoch ミリ秒 */
export type Ms = number;
/** 分 */
export type Minutes = number;
/** 半開区間 [start, end) */
export type Interval = { start: Ms; end: Ms };

export type Category = "report" | "exercise" | "quiz" | "presentation" | "other";

export type Risk = "relaxed" | "watch" | "danger" | "critical";

export type UsualCapacity = { weekday: Minutes; holiday: Minutes };

/** JST の0時からの分。日をまたいでよい(例: 60〜480 は 1:00〜8:00) */
export type SleepWindow = { startMin: number; endMin: number };

export const MINUTE: Ms = 60_000;
export const HOUR: Ms = 60 * MINUTE;
export const DAY: Ms = 24 * HOUR;
/** JST は +09:00 固定(夏時間なし) */
export const JST_OFFSET: Ms = 9 * HOUR;
