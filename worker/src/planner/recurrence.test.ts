import { describe, expect, it } from "vitest";
import { formatJstDateTime } from "../ai/jst";
import {
	isWithinEnd,
	MATERIALIZE_HORIZON,
	nextOccurrence,
	occurrenceDueAt,
	planMaterialization,
	type RepeatRule,
	type SeriesState,
} from "./recurrence";
import { DAY } from "./types";

/** JST の "YYYY-MM-DDTHH:mm" を epoch ms にする */
const at = (s: string): number => Date.parse(`${s}:00+09:00`);
const fmt = formatJstDateTime;

const rule = (over: Partial<RepeatRule> = {}): RepeatRule => ({
	freq: "weekly",
	interval: 1,
	anchorDueAt: at("2026-10-13T23:59"),
	count: null,
	until: null,
	...over,
});
const series = (over: Partial<SeriesState> = {}): SeriesState => ({
	...rule(),
	materializedCount: 1,
	stoppedAt: null,
	...over,
});
const dues = (r: RepeatRule, p: { indices: number[] }) => p.indices.map((k) => fmt(occurrenceDueAt(r, k)));

// 現在: 2026-10-12(月) 15:00 JST
const NOW = at("2026-10-12T15:00");

describe("occurrenceDueAt", () => {
	it("毎週: 基準 + k × 7日。interval 2 は隔週", () => {
		const r = rule();
		expect(fmt(occurrenceDueAt(r, 0))).toBe("2026-10-13T23:59");
		expect(fmt(occurrenceDueAt(r, 1))).toBe("2026-10-20T23:59");
		expect(fmt(occurrenceDueAt(r, 3))).toBe("2026-11-03T23:59");
		const biweekly = rule({ interval: 2 });
		expect(fmt(occurrenceDueAt(biweekly, 1))).toBe("2026-10-27T23:59");
		expect(fmt(occurrenceDueAt(biweekly, 2))).toBe("2026-11-10T23:59");
	});

	it("毎月: 31日 → 2/28 → 3/31(前の回からではなく基準から)", () => {
		const r = rule({ freq: "monthly", anchorDueAt: at("2026-01-31T23:59") });
		expect(fmt(occurrenceDueAt(r, 0))).toBe("2026-01-31T23:59");
		expect(fmt(occurrenceDueAt(r, 1))).toBe("2026-02-28T23:59");
		expect(fmt(occurrenceDueAt(r, 2))).toBe("2026-03-31T23:59");
		expect(fmt(occurrenceDueAt(r, 3))).toBe("2026-04-30T23:59");
		expect(fmt(occurrenceDueAt(r, 4))).toBe("2026-05-31T23:59");
	});

	it("毎月: うるう年の2月は29日", () => {
		const r = rule({ freq: "monthly", anchorDueAt: at("2028-01-31T10:00") });
		expect(fmt(occurrenceDueAt(r, 1))).toBe("2028-02-29T10:00");
		expect(fmt(occurrenceDueAt(r, 2))).toBe("2028-03-31T10:00");
	});

	it("毎月: 年をまたぐ。interval 2 / 12", () => {
		const r = rule({ freq: "monthly", anchorDueAt: at("2026-11-15T10:00") });
		expect(fmt(occurrenceDueAt(r, 1))).toBe("2026-12-15T10:00");
		expect(fmt(occurrenceDueAt(r, 2))).toBe("2027-01-15T10:00");
		const bimonthly = rule({ freq: "monthly", interval: 2, anchorDueAt: at("2026-01-31T23:59") });
		expect(fmt(occurrenceDueAt(bimonthly, 1))).toBe("2026-03-31T23:59");
		expect(fmt(occurrenceDueAt(bimonthly, 2))).toBe("2026-05-31T23:59");
		expect(fmt(occurrenceDueAt(bimonthly, 6))).toBe("2027-01-31T23:59");
		const yearly = rule({ freq: "monthly", interval: 12, anchorDueAt: at("2026-10-13T09:00") });
		expect(fmt(occurrenceDueAt(yearly, 1))).toBe("2027-10-13T09:00");
	});

	it("毎月: 日付は UTC ではなく JST で数える(JST の月初 0:30 は UTC では前の月)", () => {
		const r = rule({ freq: "monthly", anchorDueAt: at("2026-03-01T00:30") });
		expect(fmt(occurrenceDueAt(r, 1))).toBe("2026-04-01T00:30");
		expect(fmt(occurrenceDueAt(r, 11))).toBe("2027-02-01T00:30");
	});
});

describe("isWithinEnd", () => {
	it("無期限", () => {
		expect(isWithinEnd(rule(), 99, at("2030-01-01T00:00"))).toBe(true);
	});

	it("count: 最初の回を含む回数", () => {
		const r = rule({ count: 3 });
		expect(isWithinEnd(r, 2, occurrenceDueAt(r, 2))).toBe(true);
		expect(isWithinEnd(r, 3, occurrenceDueAt(r, 3))).toBe(false);
	});

	it("until: その日の 23:59 までの締切を含み、翌日 0:00 は含まない", () => {
		const r = rule({ until: at("2026-10-27T00:00") });
		expect(isWithinEnd(r, 2, at("2026-10-27T23:59"))).toBe(true);
		expect(isWithinEnd(r, 2, at("2026-10-28T00:00"))).toBe(false);
		// 日の途中の時刻が渡されても、その日として扱う
		const mid = rule({ until: at("2026-10-27T15:00") });
		expect(isWithinEnd(mid, 2, at("2026-10-27T23:59"))).toBe(true);
		expect(isWithinEnd(mid, 2, at("2026-10-28T00:00"))).toBe(false);
	});
});

describe("planMaterialization", () => {
	it("毎週・3回・締切は明日: 明日と来週の分まで。3回目は15日先なので、まだ作らない", () => {
		const s = series({ count: 3 });
		const p = planMaterialization(s, NOW);
		expect(dues(s, p)).toEqual(["2026-10-20T23:59"]);
		expect(p).toEqual({ indices: [1], nextMaterializedCount: 2 });
		// 10/14 0:00 になれば3回目(10/27 23:59)が14日以内に入る
		const next = planMaterialization({ ...s, materializedCount: p.nextMaterializedCount }, at("2026-10-14T00:00"));
		expect(next).toEqual({ indices: [2], nextMaterializedCount: 3 });
		// それ以降は、count に達したので何も作らない
		expect(planMaterialization({ ...s, materializedCount: 3 }, NOW + 30 * DAY)).toEqual({
			indices: [],
			nextMaterializedCount: 3,
		});
	});

	it("同じ now で2回呼んでも増えない(冪等)", () => {
		const s = series();
		const p = planMaterialization(s, NOW);
		expect(p.indices.length).toBeGreaterThan(0);
		expect(planMaterialization({ ...s, materializedCount: p.nextMaterializedCount }, NOW).indices).toEqual([]);
	});

	it("毎週・無期限: 14日以内の回をすべて作る(境界は含む)", () => {
		// 締切が now + ちょうど14日の回は含み、1ms 後は含まない
		const s = series({ anchorDueAt: at("2026-10-11T15:00") });
		const p = planMaterialization(s, NOW);
		expect(dues(s, p)).toEqual(["2026-10-18T15:00", "2026-10-25T15:00"]);
		for (const k of p.indices) expect(occurrenceDueAt(s, k)).toBeLessThanOrEqual(NOW + MATERIALIZE_HORIZON);
		const edge = series({ anchorDueAt: NOW + 7 * DAY, materializedCount: 0 });
		// k=0: now+7d, k=1: now+14d(含む), k=2: now+21d(含まない。後の回があるので作らない)
		expect(planMaterialization(edge, NOW).indices).toEqual([0, 1]);
		expect(planMaterialization({ ...edge, anchorDueAt: NOW + 7 * DAY + 1 }, NOW).indices).toEqual([0]);
	});

	it("基準が過去: 過ぎた回は作らずに飛ばし、番号だけ進める", () => {
		// 基準は3週間前の月曜 → 回 1・2 も過去、回 3 = 10/12 23:59 から先
		const s = series({ anchorDueAt: at("2026-09-21T23:59") });
		const p = planMaterialization(s, NOW);
		expect(dues(s, p)).toEqual(["2026-10-12T23:59", "2026-10-19T23:59"]);
		expect(p.indices).toEqual([3, 4]);
		expect(p.nextMaterializedCount).toBe(5);
	});

	it("全部過去で、後の回もまだ14日先にない(毎月): 次の1回だけ作る", () => {
		// 基準 9/5、now 10/12。回 1 = 10/5 は過去、回 2 = 11/5 は14日より先
		const s = series({ freq: "monthly", anchorDueAt: at("2026-09-05T23:59") });
		const p = planMaterialization(s, NOW);
		expect(p).toEqual({ indices: [2], nextMaterializedCount: 3 });
		expect(dues(s, p)).toEqual(["2026-11-05T23:59"]);
	});

	it("毎月: 14日より先でも、今ある回が過ぎたら次の1回が見える。まだ後の回があるうちは作らない", () => {
		const s = series({ freq: "monthly", anchorDueAt: at("2026-10-15T23:59") });
		// 回 0 が10/15でまだ先 → 回 1(11/15)は作らない
		expect(planMaterialization(s, NOW)).toEqual({ indices: [], nextMaterializedCount: 1 });
		// 回 0 が過ぎた後(10/16)は、回 1 を作る
		expect(planMaterialization(s, at("2026-10-16T09:00"))).toEqual({ indices: [1], nextMaterializedCount: 2 });
	});

	it("毎月・31日: 2/28 と 3/31 を基準から計算して作る", () => {
		const s = series({ freq: "monthly", anchorDueAt: at("2026-01-31T23:59") });
		const feb = planMaterialization(s, at("2026-02-20T00:00"));
		expect(dues(s, feb)).toEqual(["2026-02-28T23:59"]);
		const mar = planMaterialization({ ...s, materializedCount: feb.nextMaterializedCount }, at("2026-03-20T00:00"));
		expect(dues(s, mar)).toEqual(["2026-03-31T23:59"]);
	});

	it("隔週: 14日以内に入った回だけ", () => {
		const s = series({ interval: 2 });
		// 回 1 = 10/27 23:59 は now + 14日 (10/26 15:00) より先。回 0 が先にあるので作らない
		expect(planMaterialization(s, NOW).indices).toEqual([]);
		expect(planMaterialization(s, at("2026-10-14T00:00")).indices).toEqual([1]);
	});

	it("終わり count: 超える回は作らない。過去の回だけで count に達しても番号は進む", () => {
		const s = series({ count: 2, materializedCount: 1, anchorDueAt: at("2026-10-14T23:59") });
		expect(planMaterialization(s, NOW).indices).toEqual([1]);
		const old = series({ count: 3, anchorDueAt: at("2026-09-14T23:59") });
		expect(planMaterialization(old, NOW)).toEqual({ indices: [], nextMaterializedCount: 3 });
	});

	it("終わり until: その日を含み、翌日以降は作らない", () => {
		const base = series({ anchorDueAt: at("2026-10-13T23:59") });
		const now = at("2026-10-14T00:00");
		// 回 1 = 10/20、回 2 = 10/27(14日以内: 10/28 0:00 まで)
		expect(planMaterialization({ ...base, until: at("2026-10-27T00:00") }, now).indices).toEqual([1, 2]);
		expect(planMaterialization({ ...base, until: at("2026-10-26T00:00") }, now).indices).toEqual([1]);
		expect(planMaterialization({ ...base, until: at("2026-10-19T00:00") }, now).indices).toEqual([]);
	});

	it("止めたシリーズは何も作らない", () => {
		const s = series({ stoppedAt: NOW - DAY, materializedCount: 1 });
		expect(planMaterialization(s, NOW)).toEqual({ indices: [], nextMaterializedCount: 1 });
	});

	it("遠い過去の基準でも、調べる回数の上限内で今の分に届く", () => {
		const s = series({ anchorDueAt: at("2001-01-02T23:59"), materializedCount: 1 });
		const p = planMaterialization(s, NOW);
		expect(p.indices.length).toBe(2);
		for (const k of p.indices) {
			expect(occurrenceDueAt(s, k)).toBeGreaterThan(NOW);
			expect(occurrenceDueAt(s, k)).toBeLessThanOrEqual(NOW + 14 * DAY);
		}
	});

	it("まとめて飛ばす近道が、1回ずつ調べた結果と同じになる", () => {
		// 1回ずつ調べる素朴な実装(近道なし)
		const naive = (s: SeriesState, now: number) => {
			const horizon = now + 14 * DAY;
			const indices: number[] = [];
			let k = s.materializedCount;
			let hasFuture = k > 0 && occurrenceDueAt(s, k - 1) > now;
			for (let i = 0; i < 5000; i++) {
				const due = occurrenceDueAt(s, k);
				if (!isWithinEnd(s, k, due)) break;
				if (due <= now) k++;
				else if (due <= horizon) {
					indices.push(k++);
					hasFuture = true;
				} else {
					if (!hasFuture) indices.push(k++);
					break;
				}
			}
			return { indices, nextMaterializedCount: k };
		};
		const anchors = [
			"2025-01-31T23:59",
			"2025-06-15T09:00",
			"2026-02-28T23:59",
			"2026-09-30T00:00",
			"2026-10-30T12:00",
		];
		const nows = ["2026-10-12T15:00", "2026-11-30T23:00", "2027-03-01T00:00", "2028-02-29T12:00"];
		for (const freq of ["weekly", "monthly"] as const) {
			for (const interval of [1, 2, 5, 12]) {
				for (const a of anchors) {
					for (const n of nows) {
						for (const end of [{}, { count: 7 }, { until: at("2027-06-30T00:00") }]) {
							const s = series({ freq, interval, anchorDueAt: at(a), materializedCount: 1, ...end });
							const got = planMaterialization(s, at(n));
							const want = naive(s, at(n));
							const label = `${freq} ${interval} ${a} ${n} ${JSON.stringify(end)}`;
							expect(got.indices, label).toEqual(want.indices);
							// 終わり(until)を過ぎた系列は、番号が先まで進んでよい(もう作らないので)
							if (!("until" in end))
								expect(got.nextMaterializedCount, label).toBe(want.nextMaterializedCount);
						}
					}
				}
			}
		}
	});
});

describe("nextOccurrence", () => {
	it("now より後の最初の回", () => {
		const r = rule({ freq: "monthly", anchorDueAt: at("2026-01-31T23:59") });
		expect(nextOccurrence(r, at("2026-02-01T00:00"))).toEqual({ index: 1, dueAt: at("2026-02-28T23:59") });
		expect(nextOccurrence(r, at("2026-02-28T23:59"))).toEqual({ index: 2, dueAt: at("2026-03-31T23:59") });
		// 基準より前
		expect(nextOccurrence(r, at("2025-12-01T00:00"))).toEqual({ index: 0, dueAt: at("2026-01-31T23:59") });
	});

	it("終わりまで来ていれば null", () => {
		expect(nextOccurrence(rule({ count: 2 }), at("2026-10-21T00:00"))).toBeNull();
		expect(nextOccurrence(rule({ until: at("2026-10-20T00:00") }), at("2026-10-21T00:00"))).toBeNull();
		expect(nextOccurrence(rule({ until: at("2026-10-20T00:00") }), at("2026-10-14T00:00"))?.index).toBe(1);
	});
});
