import { describe, expect, it } from "vitest";
import { type BusyBlockLike, expandBusyBlocks, jstWeekday } from "./busy";

const jst = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+09:00`);
const base: BusyBlockLike = {
	id: "a",
	kind: "class",
	label: "",
	weekday: null,
	startMin: null,
	endMin: null,
	dateFrom: null,
	dateTo: null,
	startAt: null,
	endAt: null,
};

describe("expandBusyBlocks", () => {
	it("繰り返しの予定を曜日どおりに展開する", () => {
		// 2026-10-12 は月曜
		expect(jstWeekday(jst("2026-10-12 00:00"))).toBe(1);
		const mon1 = { ...base, weekday: 1, startMin: 9 * 60, endMin: 10 * 60 + 30 };
		const got = expandBusyBlocks([mon1], jst("2026-10-11 00:00"), jst("2026-10-25 00:00"));
		expect(got.map((i) => [i.start, i.end])).toEqual([
			[jst("2026-10-12 09:00"), jst("2026-10-12 10:30")],
			[jst("2026-10-19 09:00"), jst("2026-10-19 10:30")],
		]);
	});

	it("期間の外は出さず、期間の最終日は含める", () => {
		const b = {
			...base,
			weekday: 1,
			startMin: 540,
			endMin: 630,
			dateFrom: jst("2026-10-13 12:00"),
			dateTo: jst("2026-10-19 00:00"),
		};
		const got = expandBusyBlocks([b], jst("2026-10-01 00:00"), jst("2026-11-01 00:00"));
		expect(got.map((i) => i.start)).toEqual([jst("2026-10-19 09:00")]);
	});

	it("範囲の端で切り詰める", () => {
		const b = { ...base, startAt: jst("2026-10-12 09:00"), endAt: jst("2026-10-12 12:00") };
		const got = expandBusyBlocks([b], jst("2026-10-12 10:00"), jst("2026-10-12 11:00"));
		expect(got).toEqual([
			{ start: jst("2026-10-12 10:00"), end: jst("2026-10-12 11:00"), id: "a", kind: "class", label: "" },
		]);
	});

	it("開始時刻 → id の順に並べる", () => {
		const x = { ...base, id: "x", startAt: jst("2026-10-12 09:00"), endAt: jst("2026-10-12 10:00") };
		const y = { ...base, id: "y", startAt: jst("2026-10-12 09:00"), endAt: jst("2026-10-12 11:00") };
		const z = { ...base, id: "z", startAt: jst("2026-10-12 08:00"), endAt: jst("2026-10-12 08:30") };
		expect(expandBusyBlocks([y, x, z], jst("2026-10-12 00:00"), jst("2026-10-13 00:00")).map((i) => i.id)).toEqual([
			"z",
			"x",
			"y",
		]);
	});
});
