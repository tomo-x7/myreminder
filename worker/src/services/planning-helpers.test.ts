import { describe, expect, it } from "vitest";
import { JST_OFFSET } from "../planner/types";
import {
	activityDayKey,
	activityDayOf,
	actualForSample,
	dailyWorkForLearning,
	latestProgress,
	remainingFraction,
	workedMinutesByActivityDay,
	workedToday,
} from "./planning-helpers";

// JST の y-m-d h:mi を epoch ms にする
const jst = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - JST_OFFSET;
const WAKE = 8 * 60;

describe("活動日", () => {
	it("起床前(睡眠中)は前の日に属する", () => {
		expect(activityDayKey(activityDayOf(jst(2026, 10, 11, 0, 30), WAKE))).toBe("2026-10-10");
		expect(activityDayKey(activityDayOf(jst(2026, 10, 11, 8, 0), WAKE))).toBe("2026-10-11");
	});

	it("記録は活動日の境界(起床時刻)で切って、日ごとに足す", () => {
		// 10/10 23:00 〜 10/11 9:00。起床 8:00 で切ると 9 時間と 1 時間
		const byDay = workedMinutesByActivityDay(
			[{ startAt: jst(2026, 10, 10, 23), endAt: jst(2026, 10, 11, 9) }],
			WAKE,
		);
		const get = (key: string) => [...byDay].find(([d]) => activityDayKey(d) === key)?.[1];
		expect(get("2026-10-10")).toBe(9 * 60);
		expect(get("2026-10-11")).toBe(60);
	});

	it("終了していない記録は日ごとの集計に入れない", () => {
		expect(workedMinutesByActivityDay([{ startAt: jst(2026, 10, 10, 9), endAt: null }], WAKE).size).toBe(0);
	});
});

describe("workedToday", () => {
	const now = jst(2026, 10, 11, 12);
	it("今日より前の分は数えず、今日の起床より前は切る", () => {
		const spans = [
			{ startAt: jst(2026, 10, 10, 20), endAt: jst(2026, 10, 10, 22) },
			{ startAt: jst(2026, 10, 11, 7), endAt: jst(2026, 10, 11, 9) },
		];
		expect(workedToday(spans, WAKE, now)).toBe(60);
	});

	it("作業中の記録は now までを数える", () => {
		const spans = [
			{ startAt: jst(2026, 10, 11, 9), endAt: jst(2026, 10, 11, 10) },
			{ startAt: jst(2026, 10, 11, 11), endAt: null },
		];
		expect(workedToday(spans, WAKE, now)).toBe(120);
	});

	it("睡眠中(起床前)の now は前の活動日として数える", () => {
		const at = jst(2026, 10, 11, 1);
		const spans = [{ startAt: jst(2026, 10, 10, 23), endAt: null }];
		expect(workedToday(spans, WAKE, at)).toBe(120);
	});
});

describe("学習に渡す日ごとの作業時間", () => {
	it("今日は除き、昨日の 0 分の行を足して窓を今日から数える", () => {
		const today = activityDayOf(jst(2026, 10, 11, 12), WAKE);
		const rows = dailyWorkForLearning(new Map([[today, 50]]), today);
		expect(rows).toEqual([{ day: "2026-10-10", minutes: 0, holiday: true }]);
	});

	it("昨日の行があれば足さない。土日は holiday", () => {
		const today = activityDayOf(jst(2026, 10, 12, 12), WAKE);
		const rows = dailyWorkForLearning(new Map([[today - 1, 90]]), today);
		expect(rows).toEqual([{ day: "2026-10-11", minutes: 90, holiday: true }]);
	});
});

describe("残り・進捗", () => {
	it("進捗は 0〜100 の整数で、未記録は 0% 扱い", () => {
		expect(remainingFraction(null)).toBe(1);
		expect(remainingFraction(25)).toBe(0.75);
		expect(remainingFraction(100)).toBe(0);
		expect(remainingFraction(150)).toBe(0);
	});

	it("直近(開始が新しい)の進捗を取り、null は飛ばす", () => {
		expect(
			latestProgress([
				{ startAt: 1, progress: 25 },
				{ startAt: 3, progress: null },
				{ startAt: 2, progress: 50 },
			]),
		).toBe(50);
		expect(latestProgress([{ startAt: 1, progress: null }])).toBeNull();
	});
});

describe("見積もりのサンプル", () => {
	const s = (h0: number, h1: number | null, review = "confirmed") => ({
		startAt: jst(2026, 10, 1, h0),
		endAt: h1 === null ? null : jst(2026, 10, 1, h1),
		review,
	});
	it("確定済みの記録の合計と最後の終了時刻", () => {
		expect(actualForSample([s(9, 10), s(13, 14)])).toEqual({ actualMin: 120, completedAt: jst(2026, 10, 1, 14) });
	});
	it("確認待ちを含むタスクは使わない", () => {
		expect(actualForSample([s(9, 10), s(13, 14, "needs_review")])).toBeNull();
	});
	it("記録がない・終了していない記録だけならサンプルにしない", () => {
		expect(actualForSample([])).toBeNull();
		expect(actualForSample([s(9, null)])).toBeNull();
	});
});
