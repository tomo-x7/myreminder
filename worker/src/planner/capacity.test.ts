import { describe, expect, it } from "vitest";
import { buildCapacity, type CapacityInput, capacityUntil } from "./capacity";
import { DAY, MINUTE } from "./types";

/** JST の "YYYY-MM-DD HH:MM" を epoch ms にする */
const jst = (s: string): number => {
	const [d, t] = s.split(" ");
	return Date.parse(`${d}T${t}:00+09:00`);
};
const range = (a: string, b: string) => ({ start: jst(a), end: jst(b) });

// 2026-10-12 は月曜、10-16 は金曜、10-17 は土曜
const base: CapacityInput = {
	now: jst("2026-10-12 10:00"),
	horizonDays: 2,
	busy: [],
	sleep: { startMin: 60, endMin: 480 }, // 1:00〜8:00(0時をまたがない)
	usual: { weekday: 180, holiday: 300 },
	workedToday: 0,
};

describe("buildCapacity", () => {
	it("曜日の前提(月曜・金曜・土曜)", () => {
		expect(new Date(jst("2026-10-12 12:00")).getUTCDay()).toBe(1);
		expect(new Date(jst("2026-10-16 12:00")).getUTCDay()).toBe(5);
		expect(new Date(jst("2026-10-17 12:00")).getUTCDay()).toBe(6);
	});

	it("睡眠が0時をまたがない: 活動日は起床から次の起床まで", () => {
		const c = buildCapacity(base);
		// 1:00 は前の日に属する: 月曜の活動日は 月 8:00〜火 8:00
		expect(c.days.map((d) => [d.start, d.end])).toEqual([
			[jst("2026-10-12 08:00"), jst("2026-10-13 08:00")],
			[jst("2026-10-13 08:00"), jst("2026-10-14 08:00")],
			[jst("2026-10-14 08:00"), jst("2026-10-15 08:00")],
		]);
		expect(c.free).toEqual([
			range("2026-10-12 10:00", "2026-10-13 01:00"),
			range("2026-10-13 08:00", "2026-10-14 01:00"),
			range("2026-10-14 08:00", "2026-10-14 10:00"), // horizon = 2日後の 10:00 で切る
		]);
	});

	it("睡眠が0時をまたぐ(23:00〜7:00)", () => {
		const c = buildCapacity({ ...base, sleep: { startMin: 23 * 60, endMin: 7 * 60 } });
		expect(c.days[0]).toMatchObject({ start: jst("2026-10-12 07:00"), end: jst("2026-10-13 07:00") });
		expect(c.free).toEqual([
			range("2026-10-12 10:00", "2026-10-12 23:00"),
			range("2026-10-13 07:00", "2026-10-13 23:00"),
			range("2026-10-14 07:00", "2026-10-14 10:00"),
		]);
	});

	it("睡眠中の now は前の活動日に属し、free は起床から始まる", () => {
		const c = buildCapacity({ ...base, now: jst("2026-10-13 03:00"), horizonDays: 1 });
		expect(c.days[0]).toMatchObject({ start: jst("2026-10-12 08:00"), end: jst("2026-10-13 08:00") });
		expect(c.free[0]).toEqual(range("2026-10-13 08:00", "2026-10-14 01:00"));
		expect(c.free[1]).toBeUndefined();
	});

	it("予定と睡眠が重なっても二重に引かれず、予定同士の重なりはまとめられる", () => {
		const c = buildCapacity({
			...base,
			busy: [
				range("2026-10-12 12:00", "2026-10-12 13:00"),
				range("2026-10-12 12:30", "2026-10-12 14:00"), // 重なる
				range("2026-10-13 00:30", "2026-10-13 09:00"), // 睡眠の手前から起床後まで
				range("2026-10-12 11:00", "2026-10-12 11:00"), // 長さ0は無視
			],
		});
		expect(c.free).toEqual([
			range("2026-10-12 10:00", "2026-10-12 12:00"),
			range("2026-10-12 14:00", "2026-10-13 00:30"),
			range("2026-10-13 09:00", "2026-10-14 01:00"),
			range("2026-10-14 08:00", "2026-10-14 10:00"),
		]);
	});

	it("now より前の予定は影響しない", () => {
		const c = buildCapacity({ ...base, horizonDays: 1, busy: [range("2026-10-12 08:00", "2026-10-12 09:30")] });
		expect(c.free[0].start).toBe(base.now);
	});

	it("workedToday が今日のキャパを超えても 0 未満にならない。翌日以降は影響されない", () => {
		const c = buildCapacity({ ...base, workedToday: 500 });
		expect(c.days.map((d) => d.usualCap)).toEqual([0, 180, 180]);
		const c2 = buildCapacity({ ...base, workedToday: 100 });
		expect(c2.days.map((d) => d.usualCap)).toEqual([80, 180, 180]);
	});

	it("土日の活動日は holiday(日付は起床した日で決まる)", () => {
		const c = buildCapacity({ ...base, now: jst("2026-10-16 10:00"), horizonDays: 4 });
		expect(c.days.map((d) => d.holiday)).toEqual([false, true, true, false, false]);
		expect(c.days.map((d) => d.usualCap)).toEqual([180, 300, 300, 180, 180]);
		// 土曜 8:00 に始まる活動日は、日曜 0:30 を含んで土曜扱い
		expect(c.days[1].start).toBe(jst("2026-10-17 08:00"));
	});
});

describe("capacityUntil", () => {
	const c = buildCapacity(base);

	it("hard は free の合計、usual は活動日ごとに usualCap で頭打ち", () => {
		// 月 10:00〜12:00
		expect(capacityUntil(c, jst("2026-10-12 12:00"), "hard")).toBe(120);
		expect(capacityUntil(c, jst("2026-10-12 12:00"), "usual")).toBe(120);
		// 月 10:00〜20:00 = 600分だが、普段は 180
		expect(capacityUntil(c, jst("2026-10-12 20:00"), "hard")).toBe(600);
		expect(capacityUntil(c, jst("2026-10-12 20:00"), "usual")).toBe(180);
		// 火 12:00 まで: hard = 月 15h + 火 4h、usual = 180 + min(180, 240)
		expect(capacityUntil(c, jst("2026-10-13 12:00"), "hard")).toBe(15 * 60 + 4 * 60);
		expect(capacityUntil(c, jst("2026-10-13 12:00"), "usual")).toBe(360);
	});

	it("睡眠中は増えない", () => {
		const a = capacityUntil(c, jst("2026-10-13 01:00"), "hard");
		expect(capacityUntil(c, jst("2026-10-13 07:59"), "hard")).toBe(a);
		expect(capacityUntil(c, jst("2026-10-13 07:59"), "usual")).toBe(
			capacityUntil(c, jst("2026-10-13 01:00"), "usual"),
		);
	});

	it("今日の usualCap が 0 なら今日の分は数えない", () => {
		const c0 = buildCapacity({ ...base, workedToday: 180 });
		expect(capacityUntil(c0, jst("2026-10-12 20:00"), "usual")).toBe(0);
		expect(capacityUntil(c0, jst("2026-10-12 20:00"), "hard")).toBe(600);
	});

	it("now 以前は 0、t が horizon を超えても増えない", () => {
		expect(capacityUntil(c, base.now, "hard")).toBe(0);
		expect(capacityUntil(c, base.now - DAY, "usual")).toBe(0);
		const end = base.now + 2 * DAY;
		expect(capacityUntil(c, end + 10 * DAY, "hard")).toBe(capacityUntil(c, end, "hard"));
	});

	it("睡眠なしで free が複数の活動日にまたがっても、日ごとに数える", () => {
		const cn = buildCapacity({ ...base, sleep: { startMin: 0, endMin: 0 }, horizonDays: 2 });
		// 起床 0:00 固定 → 活動日は 0:00〜翌 0:00。月 10:00 から火 12:00 まで
		expect(cn.free).toEqual([range("2026-10-12 10:00", "2026-10-14 10:00")]);
		expect(capacityUntil(cn, jst("2026-10-13 12:00"), "usual")).toBe(180 + 180);
		expect(capacityUntil(cn, jst("2026-10-13 12:00"), "hard")).toBe(26 * 60);
	});

	it("t について単調非減少で、usual <= hard が常に成り立つ", () => {
		const cm = buildCapacity({
			...base,
			horizonDays: 5,
			workedToday: 40,
			busy: [
				range("2026-10-12 12:00", "2026-10-12 15:00"),
				range("2026-10-13 09:00", "2026-10-13 17:00"),
				range("2026-10-15 20:00", "2026-10-16 02:00"),
			],
		});
		let prevU = 0;
		let prevH = 0;
		for (let t = base.now - 3 * 60 * MINUTE; t <= base.now + 6 * DAY; t += 30 * MINUTE) {
			const u = capacityUntil(cm, t, "usual");
			const h = capacityUntil(cm, t, "hard");
			expect(u).toBeGreaterThanOrEqual(prevU);
			expect(h).toBeGreaterThanOrEqual(prevH);
			expect(u).toBeLessThanOrEqual(h);
			prevU = u;
			prevH = h;
		}
	});
});
