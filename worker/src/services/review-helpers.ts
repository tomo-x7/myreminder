// 週次のふりかえりの集計(純粋関数)。DB には触れない。仕様: ai-docs/specs/review.md
//
// 定義:
// - 週 = 活動日(起床から次の起床まで。planning-helpers.ts)の月曜から日曜までの7日。JST。
//   境界は月曜の起床時刻(睡眠時間帯の終わり)。0時ではない
// - 徹夜 = その活動日の夜(次の起床の直前の睡眠時間帯)に、確定済みの作業が合計 60 分以上重なっている
// - 完了した週 = 確定済みの作業記録の最後の終了時刻が属する活動日の週。未確定の記録を含むタスクは数えない
// - 見積もりの比率 = 実績(確定済みの作業記録の合計) / 見積もり。週の代表値は中央値
import { DAY, MINUTE, type Minutes, type Ms, type SleepWindow } from "../planner/types";
import {
	type ActivityDay,
	activityDayKey,
	activityDayOf,
	activityDayStart,
	actualForSample,
	type SessionSpan,
	workedMinutesByActivityDay,
} from "./planning-helpers";

/** 徹夜とみなす、睡眠時間帯との重なりの下限(分) */
export const ALL_NIGHTER_MIN: Minutes = 60;
/** 見積もりの比率の推移で見る週数(表示している週を含む) */
export const TREND_WEEKS = 8;

/** 0=日 〜 6=土 */
const weekdayOf = (day: ActivityDay): number => (((day + 4) % 7) + 7) % 7;

/** 活動日 → その週の月曜の活動日 */
export const mondayOf = (day: ActivityDay): ActivityDay => day - ((weekdayOf(day) + 6) % 7);

/** `YYYY-MM-DD` が実在する月曜ならその活動日、そうでなければ null */
export function parseWeekKey(key: string): ActivityDay | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
	const ms = Date.parse(`${key}T00:00:00Z`);
	if (!Number.isFinite(ms)) return null;
	const day = Math.round(ms / DAY);
	if (activityDayKey(day) !== key) return null;
	return weekdayOf(day) === 1 ? day : null;
}

/** 週の範囲 [start, end)(実際の時刻)。月曜の起床から次の月曜の起床まで */
export function weekRange(monday: ActivityDay, wakeMin: number): { start: Ms; end: Ms } {
	return { start: activityDayStart(monday, wakeMin), end: activityDayStart(monday + 7, wakeMin) };
}

/** 今(の活動日)を含む週の月曜 */
export const currentMonday = (now: Ms, wakeMin: number): ActivityDay => mondayOf(activityDayOf(now, wakeMin));

/** 活動日 d の夜の睡眠時間帯 [start, end)。次の起床 = end。睡眠時間帯がなければ null */
export function nightOf(day: ActivityDay, sleep: SleepWindow): { start: Ms; end: Ms } | null {
	const len = (((sleep.endMin - sleep.startMin) % 1440) + 1440) % 1440;
	if (len === 0) return null;
	const end = activityDayStart(day + 1, sleep.endMin);
	return { start: end - len * MINUTE, end };
}

/** 区間と窓の重なり(分)の合計。終了していない区間は数えない */
export function overlapMinutes(spans: SessionSpan[], window: { start: Ms; end: Ms }): Minutes {
	let total = 0;
	for (const { startAt, endAt } of spans) {
		if (endAt === null) continue;
		const s = Math.max(startAt, window.start);
		const e = Math.min(endAt, window.end);
		if (e > s) total += (e - s) / MINUTE;
	}
	return total;
}

/** 活動日 d の夜に徹夜したか(ファイル冒頭の定義) */
export function isAllNighter(day: ActivityDay, spans: SessionSpan[], sleep: SleepWindow): boolean {
	const night = nightOf(day, sleep);
	return night !== null && overlapMinutes(spans, night) >= ALL_NIGHTER_MIN;
}

/** 中央値。空は null */
export function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 === 1
		? (sorted[mid] as number)
		: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

// ---------- 組み立て ----------

export type ReviewSession = { taskId: string; startAt: Ms; endAt: Ms | null; review: string };
export type ReviewTask = {
	id: string;
	title: string;
	status: string;
	dueAt: Ms;
	estimateMin: Minutes;
	submittedAt: Ms | null;
};

export type ReviewDay = {
	/** 活動日(起床した日)の JST 日付 */
	date: string;
	workedMin: number;
	allNighter: boolean;
	/** その夜が明けている(次の起床を過ぎている)。途中の週で、まだ来ていない夜を「徹夜なし」に数えないため */
	counted: boolean;
};

export type Review = {
	week: string;
	prevWeek: string;
	/** 今の週より先にはならない。表示している週が今の週なら null */
	nextWeek: string | null;
	isCurrentWeek: boolean;
	days: ReviewDay[];
	totalMin: number;
	prevWeekTotalMin: number;
	unconfirmedCount: number;
	noAllNighterDays: number;
	/** noAllNighterDays の分母(夜が明けた日の数) */
	countedDays: number;
	submitted: { id: string; title: string; dueAt: Ms; submittedAt: Ms; onTime: boolean }[];
	estimate: {
		tasks: { id: string; title: string; estimateMin: Minutes; actualMin: Minutes; ratio: number }[];
		medianRatio: number | null;
	};
	/** 古い週から表示中の週まで TREND_WEEKS 件。データがない週は medianRatio = null */
	estimateTrend: { week: string; medianRatio: number | null; count: number }[];
};

const round = (n: number) => Math.round(n);

/**
 * sessions は kind = actual のもの(確認待ちを含む)、tasks は表示中の週に提出した/直近 TREND_WEEKS 週に完了したタスク。
 * 範囲は呼び出し側で絞ってあってよい(ここでも週ごとに切る)
 */
export function buildReview(input: {
	monday: ActivityDay;
	now: Ms;
	sleep: SleepWindow;
	sessions: ReviewSession[];
	tasks: ReviewTask[];
}): Review {
	const { monday, now, sleep, tasks } = input;
	const wakeMin = sleep.endMin;
	const week = weekRange(monday, wakeMin);
	const confirmed = input.sessions.filter((s) => s.review === "confirmed");
	const spans: SessionSpan[] = confirmed.map((s) => ({ startAt: s.startAt, endAt: s.endAt }));
	const byDay = workedMinutesByActivityDay(spans, wakeMin);

	const days: ReviewDay[] = [];
	for (let i = 0; i < 7; i++) {
		const day = monday + i;
		days.push({
			date: activityDayKey(day),
			workedMin: round(byDay.get(day) ?? 0),
			allNighter: isAllNighter(day, spans, sleep),
			counted: activityDayStart(day + 1, wakeMin) <= now,
		});
	}
	const sumDays = (from: ActivityDay) => {
		let total = 0;
		for (let i = 0; i < 7; i++) total += byDay.get(from + i) ?? 0;
		return round(total);
	};
	const counted = days.filter((d) => d.counted);

	// 完了した週ごとの、見積もりと実績
	const sessionsByTask = new Map<string, ReviewSession[]>();
	for (const s of input.sessions) {
		const list = sessionsByTask.get(s.taskId);
		if (list) list.push(s);
		else sessionsByTask.set(s.taskId, [s]);
	}
	const ratiosByWeek = new Map<ActivityDay, number[]>();
	const estimateTasks: Review["estimate"]["tasks"] = [];
	for (const t of tasks) {
		if ((t.status !== "done" && t.status !== "submitted") || t.estimateMin <= 0) continue;
		const sample = actualForSample(sessionsByTask.get(t.id) ?? []);
		if (!sample) continue;
		const completedWeek = mondayOf(activityDayOf(sample.completedAt, wakeMin));
		const ratio = sample.actualMin / t.estimateMin;
		const list = ratiosByWeek.get(completedWeek);
		if (list) list.push(ratio);
		else ratiosByWeek.set(completedWeek, [ratio]);
		if (completedWeek === monday) {
			estimateTasks.push({
				id: t.id,
				title: t.title,
				estimateMin: t.estimateMin,
				actualMin: round(sample.actualMin),
				ratio,
			});
		}
	}
	estimateTasks.sort((a, b) => a.title.localeCompare(b.title, "ja") || a.id.localeCompare(b.id));

	const estimateTrend: Review["estimateTrend"] = [];
	for (let k = TREND_WEEKS - 1; k >= 0; k--) {
		const m = monday - 7 * k;
		const ratios = ratiosByWeek.get(m) ?? [];
		estimateTrend.push({ week: activityDayKey(m), medianRatio: median(ratios), count: ratios.length });
	}

	const submitted = tasks
		.flatMap((t) =>
			t.submittedAt !== null && t.submittedAt >= week.start && t.submittedAt < week.end
				? [
						{
							id: t.id,
							title: t.title,
							dueAt: t.dueAt,
							submittedAt: t.submittedAt,
							onTime: t.submittedAt <= t.dueAt,
						},
					]
				: [],
		)
		.sort((a, b) => a.submittedAt - b.submittedAt || a.id.localeCompare(b.id));

	const thisMonday = currentMonday(now, wakeMin);
	return {
		week: activityDayKey(monday),
		prevWeek: activityDayKey(monday - 7),
		nextWeek: monday < thisMonday ? activityDayKey(monday + 7) : null,
		isCurrentWeek: monday === thisMonday,
		days,
		totalMin: sumDays(monday),
		prevWeekTotalMin: sumDays(monday - 7),
		unconfirmedCount: input.sessions.filter(
			(s) => s.review !== "confirmed" && s.startAt >= week.start && s.startAt < week.end,
		).length,
		noAllNighterDays: counted.filter((d) => !d.allNighter).length,
		countedDays: counted.length,
		submitted,
		estimate: { tasks: estimateTasks, medianRatio: median(estimateTasks.map((t) => t.ratio)) },
		estimateTrend,
	};
}
