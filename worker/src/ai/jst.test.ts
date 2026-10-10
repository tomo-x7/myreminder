import { describe, expect, it } from "vitest";
import { formatJstDateTime, jstWeekOffset, parseJstDateTime, startOfJstWeek, toJstParts } from "./jst";

// 2026-10-11 は日曜
const at = (s: string) => new Date(s).getTime();

describe("parseJstDateTime", () => {
	it("JST の時刻を epoch ms にする", () => {
		expect(parseJstDateTime("2026-10-12T10:40")).toBe(at("2026-10-12T10:40:00+09:00"));
	});

	it("24:00 は翌日の 0:00(月跨ぎ・年跨ぎも)", () => {
		expect(parseJstDateTime("2026-10-14T24:00")).toBe(at("2026-10-15T00:00:00+09:00"));
		expect(parseJstDateTime("2026-10-31T24:00")).toBe(at("2026-11-01T00:00:00+09:00"));
		expect(parseJstDateTime("2026-12-31T24:00")).toBe(at("2027-01-01T00:00:00+09:00"));
	});

	it("時刻なしは 23:59、空白区切りや秒・オフセット付きも JST として読む", () => {
		expect(parseJstDateTime("2026-10-14")).toBe(at("2026-10-14T23:59:00+09:00"));
		expect(parseJstDateTime("2026-10-14 09:05")).toBe(at("2026-10-14T09:05:00+09:00"));
		expect(parseJstDateTime("2026-10-14T09:05:00+09:00")).toBe(at("2026-10-14T09:05:00+09:00"));
		expect(parseJstDateTime("2026-10-14T09:05:00Z")).toBe(at("2026-10-14T09:05:00+09:00"));
	});

	it("存在しない日付・時刻は null", () => {
		expect(parseJstDateTime("2026-02-30T10:00")).toBeNull();
		expect(parseJstDateTime("2026-13-01T10:00")).toBeNull();
		expect(parseJstDateTime("2026-10-14T25:00")).toBeNull();
		expect(parseJstDateTime("2026-10-14T24:30")).toBeNull();
		expect(parseJstDateTime("2026-10-14T10:60")).toBeNull();
		expect(parseJstDateTime("来週月曜")).toBeNull();
		expect(parseJstDateTime("")).toBeNull();
	});
});

describe("JST の暦", () => {
	it("日付をまたぐ UTC でも JST の日付と曜日になる", () => {
		// UTC では 10/11 15:30 だが JST は 10/12(月) 0:30
		const p = toJstParts(at("2026-10-11T15:30:00Z"));
		expect([p.month, p.day, p.hour, p.minute, p.weekday]).toEqual([10, 12, 0, 30, 1]);
	});

	it("往復できる", () => {
		expect(formatJstDateTime(at("2026-10-12T10:40:00+09:00"))).toBe("2026-10-12T10:40");
	});

	it("週は月曜始まり: 日曜は前の週に属し、翌月曜は来週", () => {
		const sunday = at("2026-10-11T15:00:00+09:00");
		expect(startOfJstWeek(sunday)).toBe(at("2026-10-05T00:00:00+09:00"));
		expect(jstWeekOffset(at("2026-10-12T10:40:00+09:00"), sunday)).toBe(1);
		expect(jstWeekOffset(at("2026-10-11T23:59:00+09:00"), sunday)).toBe(0);
		expect(jstWeekOffset(at("2026-10-19T10:40:00+09:00"), sunday)).toBe(2);
	});
});
