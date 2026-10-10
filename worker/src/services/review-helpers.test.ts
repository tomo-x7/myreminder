import { describe, expect, it } from "vitest";
import { JST_OFFSET } from "../planner/types";
import { activityDayOf } from "./planning-helpers";
import {
	buildReview,
	currentMonday,
	isAllNighter,
	median,
	mondayOf,
	nightOf,
	parseWeekKey,
	weekRange,
} from "./review-helpers";

// JST の y-m-d h:mi を epoch ms にする
const jst = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - JST_OFFSET;
const SLEEP = { startMin: 60, endMin: 480 }; // 1:00〜8:00(起床 8:00)
const LATE_SLEEP = { startMin: 23 * 60, endMin: 7 * 60 }; // 23:00〜7:00(日をまたぐ)

describe("週の境界(JST)", () => {
	it("週のキーは月曜だけ受け付ける", () => {
		expect(parseWeekKey("2026-10-05")).not.toBeNull(); // 月曜
		expect(parseWeekKey("2026-10-06")).toBeNull();
		expect(parseWeekKey("2026-02-30")).toBeNull();
		expect(parseWeekKey("2026-10-5")).toBeNull();
	});

	it("日曜は同じ週の月曜に戻る。月曜は自分", () => {
		const mon = parseWeekKey("2026-10-05") as number;
		expect(mondayOf(mon + 6)).toBe(mon);
		expect(mondayOf(mon)).toBe(mon);
		expect(mondayOf(mon + 7)).toBe(mon + 7);
	});

	it("週は月曜の起床から次の月曜の起床まで", () => {
		const mon = parseWeekKey("2026-10-05") as number;
		const { start, end } = weekRange(mon, 480);
		expect(start).toBe(jst(2026, 10, 5, 8));
		expect(end).toBe(jst(2026, 10, 12, 8));
	});

	it("日曜の深夜(月曜 0 時台)はまだ前の週。月曜 8 時で新しい週", () => {
		const prevMon = parseWeekKey("2026-10-05") as number;
		const mon = parseWeekKey("2026-10-12") as number;
		expect(currentMonday(jst(2026, 10, 12, 0, 30), 480)).toBe(prevMon);
		expect(currentMonday(jst(2026, 10, 12, 7, 59), 480)).toBe(prevMon);
		expect(currentMonday(jst(2026, 10, 12, 8, 0), 480)).toBe(mon);
		// UTC では日曜の 15:00〜23:59 にあたる時刻でも、JST の日付で判断する
		expect(activityDayOf(jst(2026, 10, 12, 9), 480)).toBe(mon);
	});
});

describe("徹夜", () => {
	it("夜の睡眠時間帯は次の起床で終わる(1:00〜8:00 なら翌日の 1:00〜8:00)", () => {
		const d = parseWeekKey("2026-10-05") as number;
		expect(nightOf(d, SLEEP)).toEqual({ start: jst(2026, 10, 6, 1), end: jst(2026, 10, 6, 8) });
		expect(nightOf(d, LATE_SLEEP)).toEqual({ start: jst(2026, 10, 5, 23), end: jst(2026, 10, 6, 7) });
		expect(nightOf(d, { startMin: 0, endMin: 0 })).toBeNull();
	});

	const mon = parseWeekKey("2026-10-05") as number;
	const span = (a: number, b: number) => [{ startAt: a, endAt: b }];

	it("重なりが 60 分以上で徹夜。59 分は徹夜ではない", () => {
		expect(isAllNighter(mon, span(jst(2026, 10, 5, 22), jst(2026, 10, 6, 2)), SLEEP)).toBe(true);
		expect(isAllNighter(mon, span(jst(2026, 10, 5, 22), jst(2026, 10, 6, 1, 59)), SLEEP)).toBe(false);
	});

	it("日をまたぐ睡眠時間帯(23:00〜7:00)で、日付をまたぐ作業の重なりを数える", () => {
		// 22:00〜翌 1:00 → 23:00 以降の 2h が重なる
		expect(isAllNighter(mon, span(jst(2026, 10, 5, 22), jst(2026, 10, 6, 1)), LATE_SLEEP)).toBe(true);
		// 22:00〜23:30 → 30 分
		expect(isAllNighter(mon, span(jst(2026, 10, 5, 22), jst(2026, 10, 5, 23, 30)), LATE_SLEEP)).toBe(false);
	});

	it("複数の記録の重なりを合計する。終了していない記録は数えない", () => {
		const spans = [
			{ startAt: jst(2026, 10, 6, 1), endAt: jst(2026, 10, 6, 1, 30) },
			{ startAt: jst(2026, 10, 6, 3), endAt: jst(2026, 10, 6, 3, 30) },
		];
		expect(isAllNighter(mon, spans, SLEEP)).toBe(true);
		expect(isAllNighter(mon, [{ startAt: jst(2026, 10, 6, 1), endAt: null }], SLEEP)).toBe(false);
	});

	it("起床後の作業は、その日の夜には関係しない", () => {
		expect(isAllNighter(mon, span(jst(2026, 10, 5, 9), jst(2026, 10, 5, 23)), SLEEP)).toBe(false);
	});
});

describe("中央値", () => {
	it("奇数・偶数・空", () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(median([])).toBeNull();
		expect(median([1.4])).toBe(1.4);
	});
});

describe("buildReview", () => {
	const now = jst(2026, 10, 12, 9); // 月曜の朝。直近の終わった週は 10/5〜10/11
	const monday = parseWeekKey("2026-10-05") as number;
	const s = (taskId: string, a: number, b: number, review = "confirmed") => ({
		taskId,
		startAt: a,
		endAt: b,
		review,
	});
	const task = (id: string, extra: object = {}) => ({
		id,
		title: id,
		status: "submitted",
		dueAt: jst(2026, 10, 9, 23, 59),
		estimateMin: 60,
		submittedAt: null as number | null,
		...extra,
	});

	it("日ごとの作業・徹夜・見積もりの比率・提出の期限内/後を出す", () => {
		const r = buildReview({
			monday,
			now,
			sleep: SLEEP,
			sessions: [
				s("a", jst(2026, 10, 5, 10), jst(2026, 10, 5, 11, 30)), // 月 90分
				s("a", jst(2026, 10, 7, 20), jst(2026, 10, 8, 2)), // 水 20:00〜木 2:00(活動日は水。1:00〜2:00 が睡眠中)
				s("b", jst(2026, 10, 6, 10), jst(2026, 10, 6, 12), "needs_review"),
			],
			tasks: [
				task("a", { submittedAt: jst(2026, 10, 9, 20), estimateMin: 120 }),
				task("b", { submittedAt: jst(2026, 10, 10, 0, 30) }),
			],
		});
		expect(r.week).toBe("2026-10-05");
		expect(r.prevWeek).toBe("2026-09-28");
		expect(r.nextWeek).toBe("2026-10-12");
		expect(r.days.map((d) => d.workedMin)).toEqual([90, 0, 360, 0, 0, 0, 0]);
		expect(r.days.map((d) => d.allNighter)).toEqual([false, false, true, false, false, false, false]);
		expect(r.noAllNighterDays).toBe(6);
		expect(r.countedDays).toBe(7);
		expect(r.totalMin).toBe(450);
		expect(r.unconfirmedCount).toBe(1);
		expect(r.submitted.map((t) => [t.id, t.onTime])).toEqual([
			["a", true],
			["b", false],
		]);
		// b は確認待ちを含むので見積もりの学習に数えない。a は 450 分 / 120 分
		expect(r.estimate.tasks.map((t) => [t.id, t.actualMin])).toEqual([["a", 450]]);
		expect(r.estimate.medianRatio).toBe(450 / 120);
		expect(r.estimateTrend).toHaveLength(8);
		expect(r.estimateTrend[7]).toMatchObject({ week: "2026-10-05", count: 1 });
		expect(r.estimateTrend[6]).toMatchObject({ week: "2026-09-28", medianRatio: null, count: 0 });
	});

	it("今の週は、夜が明けていない日を徹夜なしの分母に入れない", () => {
		const r = buildReview({
			monday: monday + 7,
			now: jst(2026, 10, 14, 12),
			sleep: SLEEP,
			sessions: [],
			tasks: [],
		});
		expect(r.isCurrentWeek).toBe(true);
		expect(r.nextWeek).toBeNull();
		// 月・火の夜は明けている。水(今日)は夜がまだ
		expect(r.countedDays).toBe(2);
		expect(r.noAllNighterDays).toBe(2);
	});

	it("完了した週の境界: 月曜の起床前に終えた作業は前の週", () => {
		const r = buildReview({
			monday,
			now,
			sleep: SLEEP,
			sessions: [s("a", jst(2026, 10, 12, 6), jst(2026, 10, 12, 7))],
			tasks: [task("a")],
		});
		expect(r.estimate.tasks.map((t) => t.id)).toEqual(["a"]);
		expect(r.estimateTrend[7]?.count).toBe(1);
	});
});
