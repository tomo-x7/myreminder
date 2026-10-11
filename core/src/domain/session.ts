// 作業記録(sessions)の表示の規則。日ごとのまとめ、期間、「いつ終わった?」の候補
import type { SessionPatch, SessionRow } from "../api/types";
import { DAY, MINUTE, startOfJstDay } from "./date";

/** 進捗の選択肢。作業を終えるとき・確認待ちの記録に聞くときは 0% を出さない */
export const PROGRESS_STEPS = [25, 50, 75, 100] as const;
export const PROGRESS_OPTIONS = [0, ...PROGRESS_STEPS] as const;

/** 作業記録の一覧の期間。今日を含む days 日分(JST) */
export function sessionRange(now: number, days: number): { from: number; to: number } {
	return { from: startOfJstDay(now) - (days - 1) * DAY, to: startOfJstDay(now) + DAY };
}

export type SessionDayGroup = {
	/** その日(JST)の 0:00 */
	day: number;
	/** 開始の新しい順 */
	items: SessionRow[];
	/** 終わっている記録の合計(ms)。作業中は含めない */
	totalMs: number;
};

/** JST の日ごとにまとめる。日は新しい順 */
export function groupSessionsByDay(sessions: readonly SessionRow[]): SessionDayGroup[] {
	const byDay = new Map<number, SessionRow[]>();
	for (const s of sessions) {
		const day = startOfJstDay(s.startAt);
		byDay.set(day, [...(byDay.get(day) ?? []), s]);
	}
	return [...byDay.entries()]
		.sort((a, b) => b[0] - a[0])
		.map(([day, items]) => ({
			day,
			items: [...items].sort((a, b) => b.startAt - a.startAt),
			totalMs: items.reduce((sum, s) => sum + (s.endAt === null ? 0 : s.endAt - s.startAt), 0),
		}));
}

/** 確認待ちの記録に聞く「いつ終わった?」の候補。仮の終了時刻(なければ null)と、開始 + 見積もり */
export function reviewEndOptions(s: Pick<SessionRow, "startAt" | "endAt" | "taskEstimateMin">): {
	provisional: number | null;
	byEstimate: number;
} {
	return { provisional: s.endAt, byEstimate: s.startAt + s.taskEstimateMin * MINUTE };
}

/** 確認待ちを終了時刻つきで確定する更新。進捗は選んだときだけ送る */
export function reviewPatch(endAt: number, progress: number | null): SessionPatch {
	return { endAt, review: "confirmed", ...(progress !== null && { progress }) };
}
