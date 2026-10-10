import { describe, expect, it } from "vitest";
import type { UsualCapacity } from "./types";
import { type DailyWork, learnUsualCapacity } from "./usual-capacity";

/** 2026-09-01 (火) から連続する n 日。dow を見て土日を holiday にする */
function dayString(offset: number): string {
	const d = new Date(Date.UTC(2026, 8, 1 + offset));
	return d.toISOString().slice(0, 10);
}

function isWeekend(offset: number): boolean {
	const dow = new Date(Date.UTC(2026, 8, 1 + offset)).getUTCDay();
	return dow === 0 || dow === 6;
}

function make(offset: number, minutes: number, holiday = isWeekend(offset)): DailyWork {
	return { day: dayString(offset), minutes, holiday };
}

const DEFAULTS: UsualCapacity = { weekday: 180, holiday: 300 };

describe("learnUsualCapacity", () => {
	it("データがなければ初期値", () => {
		expect(learnUsualCapacity([])).toEqual(DEFAULTS);
	});

	it("作業しなかった日(minWorked 未満)を無視する", () => {
		const worked = [0, 1, 2, 3, 4].map((o) => make(o, 240, false));
		const idle = [5, 6, 7, 8, 9].map((o) => make(o, 0, false));
		const almost = [10, 11].map((o) => make(o, 29, false));
		const a = learnUsualCapacity(worked);
		const b = learnUsualCapacity([...worked, ...idle, ...almost]);
		expect(b).toEqual(a);
		// 30 分ちょうどは作業した日に数える
		const edge = learnUsualCapacity([make(0, 30, false)]);
		expect(edge.weekday).toBeCloseTo((30 + 3 * 180) / 4, 10);
	});

	it("平日と休日を分ける", () => {
		const days = Array.from({ length: 20 }, (_, o) => make(o, isWeekend(o) ? 400 : 120));
		const cap = learnUsualCapacity(days);
		// 平日 120 分 × n=14 日、休日 400 分 × n=6 日 を初期値に寄せる
		const nWeek = days.filter((d) => !d.holiday).length;
		const nHol = days.filter((d) => d.holiday).length;
		expect(cap.weekday).toBeCloseTo((nWeek * 120 + 3 * 180) / (nWeek + 3), 10);
		expect(cap.holiday).toBeCloseTo((nHol * 400 + 3 * 300) / (nHol + 3), 10);
		expect(cap.holiday).toBeGreaterThan(cap.weekday);
	});

	it("作業した日が2日だけなら初期値に寄る", () => {
		const cap = learnUsualCapacity([make(0, 400, false), make(1, 400, false)]);
		expect(cap.weekday).toBeCloseTo((2 * 400 + 3 * 180) / 5, 10);
		expect(cap.weekday).toBeGreaterThan(180);
		expect(cap.weekday).toBeLessThan(400);
		expect(cap.holiday).toBe(300);
	});

	it("分位点は線形補間(P75)", () => {
		// 60,120,180,240,300 → P75 は 240。n=5, m=3: (5·240 + 3·180)/8
		const days = [60, 120, 180, 240, 300].map((x, i) => make(i, x, false));
		expect(learnUsualCapacity(days).weekday).toBeCloseTo((5 * 240 + 3 * 180) / 8, 10);
		// 4件 60,120,180,240: h = 2.25 → 180 + 0.25·60 = 195
		expect(learnUsualCapacity(days.slice(0, 4)).weekday).toBeCloseTo((4 * 195 + 3 * 180) / 7, 10);
		// q を指定できる
		expect(learnUsualCapacity(days, { q: 0.5 }).weekday).toBeCloseTo((5 * 180 + 3 * 180) / 8, 10);
	});

	it("floor を下回らない", () => {
		const days = Array.from({ length: 28 }, (_, o) => make(o, 30, false));
		const cap = learnUsualCapacity(days, { defaults: { weekday: 20, holiday: 20 } });
		expect(cap.weekday).toBeGreaterThanOrEqual(60);
		expect(cap.holiday).toBe(60);
		expect(learnUsualCapacity(days, { floor: 10, defaults: { weekday: 20, holiday: 20 } }).weekday).toBeCloseTo(
			(28 * 30 + 3 * 20) / 31,
			10,
		);
	});

	it("直近 windowDays 日だけを使う", () => {
		const old = Array.from({ length: 10 }, (_, o) => make(o, 600, false));
		const recent = Array.from({ length: 5 }, (_, o) => make(40 + o, 100, false));
		// 最新日は offset 44。窓 28 日 = offset 17 以降なので古い分は入らない
		expect(learnUsualCapacity([...old, ...recent]).weekday).toBeCloseTo((5 * 100 + 3 * 180) / 8, 10);
		// 窓を広げると入る
		expect(learnUsualCapacity([...old, ...recent], { windowDays: 60 }).weekday).toBeGreaterThan(200);
		// 窓の端: 最新日 − 27 日は入り、−28 日は入らない
		const edge = [make(0, 600, false), make(27, 100, false), make(28, 100, false)];
		expect(learnUsualCapacity(edge).weekday).toBeCloseTo((2 * 100 + 3 * 180) / 5, 10);
		const edge2 = [make(0, 600, false), make(27, 100, false)];
		expect(learnUsualCapacity(edge2).weekday).toBeGreaterThan(learnUsualCapacity(edge).weekday);
	});

	it("入力の並びに依らない", () => {
		const days = Array.from({ length: 25 }, (_, o) => make(o, 90 + ((o * 37) % 200)));
		expect(learnUsualCapacity([...days].reverse())).toEqual(learnUsualCapacity(days));
	});
});
