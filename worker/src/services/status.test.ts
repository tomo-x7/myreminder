import { describe, expect, it } from "vitest";
import { sessionsOverlap } from "./sessions";
import {
	busyRunAt,
	type ManualStatus,
	provisionalEnd,
	resolveEffectiveStatus,
	shouldAskStillWorking,
	sleepWindowAt,
} from "./status";

const jst = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+09:00`);
const MIN = 60_000;
// 1:00〜8:00 と 23:00〜7:00(日またぎ)
const sleepDay = { startMin: 60, endMin: 480 };
const sleepWrap = { startMin: 23 * 60, endMin: 7 * 60 };

const resolve = (
	now: string,
	over: Partial<Parameters<typeof resolveEffectiveStatus>[0]> & { manual?: ManualStatus | null } = {},
) =>
	resolveEffectiveStatus({
		now: jst(now),
		manual: null,
		openSession: null,
		sleep: sleepWrap,
		busy: [],
		...over,
	});

describe("sleepWindowAt", () => {
	it("日をまたぐ時間帯の前半・後半・外を見分ける", () => {
		expect(sleepWindowAt(sleepWrap, jst("2026-10-12 23:30"))).toEqual({
			start: jst("2026-10-12 23:00"),
			end: jst("2026-10-13 07:00"),
		});
		expect(sleepWindowAt(sleepWrap, jst("2026-10-13 06:59"))).toEqual({
			start: jst("2026-10-12 23:00"),
			end: jst("2026-10-13 07:00"),
		});
		expect(sleepWindowAt(sleepWrap, jst("2026-10-13 07:00"))).toBeNull();
		expect(sleepWindowAt(sleepWrap, jst("2026-10-13 22:59"))).toBeNull();
	});
	it("日をまたがない時間帯。終端は含まない", () => {
		expect(sleepWindowAt(sleepDay, jst("2026-10-12 01:00"))?.end).toBe(jst("2026-10-12 08:00"));
		expect(sleepWindowAt(sleepDay, jst("2026-10-12 08:00"))).toBeNull();
		expect(sleepWindowAt(sleepDay, jst("2026-10-12 00:59"))).toBeNull();
	});
	it("start === end は睡眠なし", () => {
		expect(sleepWindowAt({ startMin: 0, endMin: 0 }, jst("2026-10-12 03:00"))).toBeNull();
	});
});

describe("resolveEffectiveStatus", () => {
	it("何もなければ通常", () => {
		expect(resolve("2026-10-12 12:00")).toEqual({ mode: "normal", source: "auto" });
	});
	it("睡眠時間帯はおやすみ(終わりつき)、授業より優先", () => {
		const s = resolve("2026-10-13 02:00", { busy: [{ label: "夜間", end: jst("2026-10-13 03:00") }] });
		expect(s).toMatchObject({ mode: "sleep", source: "auto", until: jst("2026-10-13 07:00") });
	});
	it("授業中は取り込み中(ラベルつき)", () => {
		const s = resolve("2026-10-12 10:00", { busy: [{ label: "線形代数", end: jst("2026-10-12 10:40") }] });
		expect(s).toMatchObject({ mode: "busy", source: "auto", label: "線形代数", until: jst("2026-10-12 10:40") });
	});
	it("手動は期限内なら自動に勝ち、期限が切れたら自動に戻る", () => {
		const manual: ManualStatus = { mode: "busy", taskId: null, until: jst("2026-10-13 03:00") };
		expect(resolve("2026-10-13 02:00", { manual })).toMatchObject({ mode: "busy", source: "manual" });
		expect(resolve("2026-10-13 03:00", { manual })).toMatchObject({ mode: "sleep", source: "auto" });
		expect(resolve("2026-10-13 03:01", { manual }).source).toBe("auto");
	});
	it("期限なしの手動 busy/sleep は続く", () => {
		const manual: ManualStatus = { mode: "sleep", taskId: null, until: null };
		expect(resolve("2026-10-12 12:00", { manual })).toEqual({ mode: "sleep", source: "manual" });
	});
	it("normal + 期限つきは自動(睡眠)を上書きし、期限なしは手動設定なしとみなす", () => {
		const until = jst("2026-10-13 03:00");
		expect(resolve("2026-10-13 02:00", { manual: { mode: "normal", taskId: null, until } })).toMatchObject({
			mode: "normal",
			source: "manual",
		});
		expect(resolve("2026-10-13 02:00", { manual: { mode: "normal", taskId: null, until: null } }).mode).toBe(
			"sleep",
		);
	});
	it("開いている作業記録があれば作業中(睡眠中でも期限切れなし)。記録がない working は無視", () => {
		const openSession = { id: "s", taskId: "t", startAt: jst("2026-10-12 23:30") };
		expect(resolve("2026-10-13 02:00", { openSession, taskTitle: "レポート" })).toMatchObject({
			mode: "working",
			taskId: "t",
			taskTitle: "レポート",
		});
		expect(resolve("2026-10-12 12:00", { manual: { mode: "working", taskId: "t", until: null } }).mode).toBe(
			"normal",
		);
	});
});

describe("busyRunAt", () => {
	const run = (now: string, list: [string, string, string][]) =>
		busyRunAt(
			list.map(([label, start, end]) => ({ label, start: jst(start), end: jst(end) })),
			jst(now),
		);
	it("now を含む予定の終わりまで。now で切らない", () => {
		expect(run("2026-10-12 10:00", [["線形代数", "2026-10-12 09:00", "2026-10-12 10:40"]])).toEqual([
			{ label: "線形代数", end: jst("2026-10-12 10:40") },
		]);
	});
	it("隣り合う・重なる予定はつないで、最後の終わりを返す。ラベルは now を含む最初の予定", () => {
		const list: [string, string, string][] = [
			["2限", "2026-10-12 10:40", "2026-10-12 12:10"],
			["1限", "2026-10-12 09:00", "2026-10-12 10:40"],
			["バイト", "2026-10-12 12:00", "2026-10-12 17:00"],
			["夜の講義", "2026-10-12 18:00", "2026-10-12 19:00"],
		];
		expect(run("2026-10-12 10:00", list)).toEqual([{ label: "1限", end: jst("2026-10-12 17:00") }]);
	});
	it("now を含む予定がなければ空(終わりちょうども含まない)", () => {
		const list: [string, string, string][] = [["1限", "2026-10-12 09:00", "2026-10-12 10:40"]];
		expect(run("2026-10-12 10:40", list)).toEqual([]);
		expect(run("2026-10-12 08:59", list)).toEqual([]);
	});
});

describe("shouldAskStillWorking", () => {
	it("3時間か、残りの見積もりを超えたら確認する", () => {
		expect(shouldAskStillWorking(179, 600)).toBe(false);
		expect(shouldAskStillWorking(180, 600)).toBe(true);
		expect(shouldAskStillWorking(59, 60)).toBe(false);
		expect(shouldAskStillWorking(60, 60)).toBe(true);
	});
	it("残りが 0 以下なら見積もりでは判定しない", () => {
		expect(shouldAskStillWorking(10, 0)).toBe(false);
	});
});

describe("provisionalEnd", () => {
	const startAt = jst("2026-10-12 22:00");
	const sleepStart = jst("2026-10-12 23:00");
	it("見積もりが経過より短ければ start + 見積もり", () => {
		expect(provisionalEnd({ startAt, now: jst("2026-10-13 01:00"), remainingEstimateMin: 30, sleepStart })).toBe(
			startAt + 30 * MIN,
		);
	});
	it("経過が短ければ start + 経過。睡眠時間帯の開始は超えない", () => {
		expect(provisionalEnd({ startAt, now: jst("2026-10-12 22:20"), remainingEstimateMin: 120, sleepStart })).toBe(
			startAt + 20 * MIN,
		);
		expect(provisionalEnd({ startAt, now: jst("2026-10-13 01:00"), remainingEstimateMin: 300, sleepStart })).toBe(
			sleepStart,
		);
	});
	it("残りが 0 以下なら start(負にならない)", () => {
		expect(provisionalEnd({ startAt, now: jst("2026-10-13 01:00"), remainingEstimateMin: -5, sleepStart })).toBe(
			startAt,
		);
	});
});

describe("sessionsOverlap", () => {
	it("隣り合うだけなら重ならない。未終了は先まで続く", () => {
		expect(sessionsOverlap({ startAt: 0, endAt: 10 }, { startAt: 10, endAt: 20 })).toBe(false);
		expect(sessionsOverlap({ startAt: 0, endAt: 11 }, { startAt: 10, endAt: 20 })).toBe(true);
		expect(sessionsOverlap({ startAt: 100, endAt: 110 }, { startAt: 10, endAt: null })).toBe(true);
		expect(sessionsOverlap({ startAt: 0, endAt: 10 }, { startAt: 10, endAt: null })).toBe(false);
	});
});
