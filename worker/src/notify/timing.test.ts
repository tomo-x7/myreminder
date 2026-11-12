import { describe, expect, it } from "vitest";
import { fromJstParts } from "../ai/jst";
import { DAY, HOUR, MINUTE } from "../planner/types";
import {
	buildTimingModel,
	RESPONSE_WINDOW,
	selectRiskBreakpoints,
	TIMING_WARMUP,
	type TimingModel,
	type TimingNotification,
	type TimingSession,
	timingArm,
} from "./timing";

const now = fromJstParts(2026, 11, 10, 20);
const old = now - TIMING_WARMUP;
const notification = (id: string, sentAt: number, extra: Partial<TimingNotification> = {}): TimingNotification => ({
	id,
	taskId: "task",
	kind: "risk",
	status: "sent",
	sentAt,
	dedupeKey: `risk:task:${id}`,
	...extra,
});
const session = (id: string, startAt: number, extra: Partial<TimingSession> = {}): TimingSession => ({
	id,
	taskId: "task",
	startAt,
	kind: "actual",
	review: "confirmed",
	...extra,
});

describe("通知時間帯の学習", () => {
	it("JSTの4時間帯に分ける", () => {
		expect(
			[0, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 23].map((h) => timingArm(fromJstParts(2026, 11, 10, h))),
		).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
	});

	it("全種別の運用開始から28日経ち、観測がある場合だけ有効", () => {
		const notes = [notification("n", now - HOUR)];
		expect(buildTimingModel(notes, [], now, old + 1).enabled).toBe(false);
		expect(buildTimingModel(notes, [], now, old).enabled).toBe(true);
		expect(buildTimingModel(notes, [], now, null).enabled).toBe(false);
		expect(buildTimingModel([], [], now, old).enabled).toBe(false);
	});

	it("対象課題を30分以内に開始した記録だけ成功にする（境界を含む）", () => {
		const at = now - HOUR;
		const notes = [notification("n", at)];
		for (const offset of [0, RESPONSE_WINDOW]) {
			const m = buildTimingModel(notes, [session("s", at + offset)], now, old);
			expect(m.arms[timingArm(at)].successes).toBe(1);
		}
		for (const s of [
			session("s", at - 1),
			session("s", at + RESPONSE_WINDOW + 1),
			session("s", at + MINUTE, { taskId: "other" }),
			session("s", at + MINUTE, { review: "needs_review" }),
			session("s", at + MINUTE, { kind: "planned" }),
		]) {
			expect(buildTimingModel(notes, [s], now, old).arms[timingArm(at)].successes).toBe(0);
		}
	});

	it("同じ作業開始を直近の適合通知だけへ帰属させ、開始が複数でも成功は1件", () => {
		const at = now - HOUR;
		const notes = [notification("older", at), notification("newer", at + 10 * MINUTE)];
		const m = buildTimingModel(notes, [session("s1", at + 20 * MINUTE), session("s2", at + 25 * MINUTE)], now, old);
		expect(m.observations).toBe(2);
		expect(m.arms[timingArm(at)]).toMatchObject({ count: 2, successes: 1 });
		expect(m.arms[timingArm(at)].alpha).toBe(2);
		expect(m.arms[timingArm(at)].beta).toBe(2);
	});

	it("同時刻の通知も入力順によらず1件だけにcreditする", () => {
		const at = now - HOUR;
		const notes = [notification("a", at), notification("b", at)];
		const starts = [session("s", at + MINUTE)];
		expect(buildTimingModel(notes, starts, now, old)).toEqual(
			buildTimingModel([...notes].reverse(), starts, now, old),
		);
		expect(buildTimingModel(notes, starts, now, old).arms[timingArm(at)].successes).toBe(1);
	});

	it("観測窓が閉じるまで成功も加算せず、ちょうど30分で確定する", () => {
		const at = now - RESPONSE_WINDOW;
		const notes = [notification("mature", at), notification("young", at + 1)];
		const m = buildTimingModel(notes, [session("s", at + 2)], now, old);
		expect(m.observations).toBe(1);
		expect(m.arms[timingArm(at)]).toMatchObject({ count: 1, successes: 0 });
	});

	it("実送信以外・固定通知・対象課題なし・不正な時刻を除く", () => {
		const at = now - HOUR;
		const notes = [
			notification("sent", at),
			notification("pending", at, { status: "pending" }),
			notification("merged", at, { status: "merged" }),
			notification("digest", at, { kind: "digest" }),
			notification("start", at, { kind: "start" }),
			notification("critical", at, { kind: "critical" }),
			notification("safety", at, { dedupeKey: "due:task:1234:24h" }),
			notification("old-keyless", at, { dedupeKey: null }),
			notification("null-task", at, { taskId: null }),
			notification("null-at", at, { sentAt: null }),
			notification("nan", Number.NaN),
			notification("future", now + HOUR),
		];
		expect(buildTimingModel(notes, [], now, old).observations).toBe(1);
	});

	it("28日前の観測を半分に減衰し、日中の再計画では減衰量を変えない", () => {
		const m = buildTimingModel([notification("n", now - 28 * DAY - HOUR)], [], now, old - DAY);
		expect(m.arms[timingArm(now - HOUR)].beta).toBeCloseTo(1.5);
		expect(buildTimingModel([notification("n", now - 28 * DAY - HOUR)], [], now + HOUR, old - DAY)).toEqual(m);
	});
});

describe("学習から危険通知の切れ目を選ぶ", () => {
	const at = fromJstParts(2026, 11, 10, 8);
	const candidates = [at, at + HOUR, at + 4 * HOUR, at + 8 * HOUR];

	it("無効・観測不足なら従来どおり先の候補から選ぶ", () => {
		expect(selectRiskBreakpoints(candidates, 2, undefined, "task")).toEqual([at, at + 4 * HOUR]);
		const disabled = buildTimingModel([], [], now, old);
		expect(selectRiskBreakpoints(candidates, 2, disabled, "task")).toEqual([at, at + 4 * HOUR]);
	});

	it("候補だけを返し、件数・最短間隔を守る。順序や重複候補で変わらない", () => {
		const m = buildTimingModel([notification("n", now - HOUR)], [], now, old);
		for (let i = 0; i < 50; i++) {
			const selected = selectRiskBreakpoints(candidates, 2, m, `task:${i}`);
			expect(selected.length).toBeLessThanOrEqual(2);
			expect(selected.every((t) => candidates.includes(t))).toBe(true);
			expect(selected).toEqual([...selected].sort((a, b) => a - b));
			if (selected.length === 2) expect(selected[1] - selected[0]).toBeGreaterThanOrEqual(3 * HOUR);
			expect(selectRiskBreakpoints([...candidates].reverse().concat(candidates), 2, m, `task:${i}`)).toEqual(
				selected,
			);
		}
		expect(selectRiskBreakpoints(candidates, 0, m, "task")).toEqual([]);
		expect(selectRiskBreakpoints([], 3, m, "task")).toEqual([]);
	});

	it("同じ履歴とseedで決定的に選び、実績の良い時間帯を優先する", () => {
		const m: TimingModel = {
			enabled: true,
			observations: 2000,
			arms: Array.from({ length: 6 }, (_, arm) => ({
				alpha: arm === 4 ? 1001 : 1,
				beta: arm === 4 ? 1 : 1001,
				count: 1000,
				successes: arm === 4 ? 1000 : 0,
			})),
		};
		const first = selectRiskBreakpoints(candidates, 1, m, "task:deadline:0:2026-11-10");
		expect(first).toEqual([at + 8 * HOUR]);
		expect(selectRiskBreakpoints(candidates, 1, m, "task:deadline:0:2026-11-10")).toEqual(first);
	});
});
