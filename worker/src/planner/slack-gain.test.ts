import { describe, expect, it } from "vitest";
import type { CapacityInput } from "./capacity";
import type { PlanTask } from "./schedule";
import { type SlackGainInput, slackGain } from "./slack-gain";
import { DAY, HOUR, type Interval, MINUTE } from "./types";

/** JST の "YYYY-MM-DD HH:MM" を epoch ms にする */
const jst = (s: string): number => {
	const [d, t] = s.split(" ");
	return Date.parse(`${d}T${t}:00+09:00`);
};

// 2026-10-12 は月曜。睡眠は 0:00〜8:00、普段のキャパは平日 180 分/日
const NOW = jst("2026-10-12 09:00");
const TUE_END = "2026-10-14 00:00";
const WED_END = "2026-10-15 00:00";
const THU_END = "2026-10-16 00:00";
const FRI_END = "2026-10-17 00:00";

const capInput = (over: Partial<CapacityInput> = {}): CapacityInput => ({
	now: NOW,
	horizonDays: 14,
	busy: [],
	sleep: { startMin: 0, endMin: 480 },
	usual: { weekday: 180, holiday: 300 },
	workedToday: 0,
	...over,
});
const task = (id: string, due: string, p: number, over: Partial<PlanTask> = {}): PlanTask => ({
	id,
	dueAt: jst(due),
	remainingP80: p,
	minBlock: 30,
	...over,
});
const run = (
	tasks: PlanTask[],
	candidateIds: string[],
	over: { spareMin?: number; cap?: Partial<CapacityInput>; tau?: number } = {},
) =>
	slackGain({
		capacityInput: capInput(over.cap),
		tasks,
		marginRatio: 0.5,
		candidateIds,
		spareMin: over.spareMin ?? 60,
		tau: over.tau,
	} satisfies SlackGainInput);
const get = (out: ReturnType<typeof slackGain>, id: string) => {
	const g = out.find((x) => x.id === id);
	if (!g) throw new Error(`no gain ${id}`);
	return g;
};

describe("slackGain: 流体の性質", () => {
	// 火曜末の余裕 240、水曜末(山場)120、木曜末 180、金曜末 240
	const tasks = [task("a", TUE_END, 120), task("b", WED_END, 300), task("c", THU_END, 120), task("d", FRI_END, 120)];

	it("締切が早い候補ほど bottleneckDeltaMin が大きいか等しい", () => {
		const out = run(tasks, ["a", "b", "c", "d"]);
		const ordered = [...out].sort((x, y) => x.id.localeCompare(y.id)).map((g) => g.bottleneckDeltaMin);
		for (let i = 1; i < ordered.length; i++) expect(ordered[i]).toBeLessThanOrEqual(ordered[i - 1]);
		expect(out.every((g) => g.infeasibleDelta === 0)).toBe(true);
	});

	it("山場以前の候補同士は bottleneckDeltaMin が等しく、締切順に並ぶ", () => {
		const out = run(tasks, ["d", "c", "b", "a"]);
		expect(out.map((g) => g.id)).toEqual(["a", "b", "c", "d"]);
		expect(get(out, "a").bottleneckDeltaMin).toBe(60);
		expect(get(out, "b").bottleneckDeltaMin).toBe(60);
		// 山場より後ろは山場の余裕を増やせない
		expect(get(out, "c").bottleneckDeltaMin).toBe(0);
		expect(get(out, "d").bottleneckDeltaMin).toBe(0);
		// ストレスは締切が早いほど大きく減る
		expect(get(out, "a").stressDelta).toBeLessThan(get(out, "b").stressDelta);
		expect(get(out, "b").stressDelta).toBeLessThan(get(out, "c").stressDelta);
		expect(get(out, "c").stressDelta).toBeLessThan(get(out, "d").stressDelta);
		for (const g of out) expect(g.stressDelta).toBeLessThan(0);
	});

	it("reason: 山場以前は before_peak、それより後ろは earliest", () => {
		const out = run(tasks, ["a", "b", "c", "d"]);
		expect(out.map((g) => g.reason)).toEqual(["before_peak", "before_peak", "earliest", "earliest"]);
	});

	it("uncertain は before_peak より優先される", () => {
		const out = run(
			[task("a", TUE_END, 120), task("b", WED_END, 300, { uncertain: true }), task("c", THU_END, 120)],
			["a", "b", "c"],
		);
		expect(get(out, "b").reason).toBe("uncertain");
		expect(get(out, "a").reason).toBe("before_peak");
	});
});

describe("slackGain: 頭打ちと入力の扱い", () => {
	it("残りが spareMin より少ない候補は、改善量が残りの分で頭打ちになる", () => {
		// x は早い締切だが残り 20 分。y は遅い締切でも 60 分ぶん改善できる
		const tasks = [task("x", TUE_END, 20), task("y", WED_END, 300)];
		const out = run(tasks, ["x", "y"], { spareMin: 60 });
		expect(get(out, "x").bottleneckDeltaMin).toBe(20);
		expect(get(out, "y").bottleneckDeltaMin).toBe(60);
		expect(out.map((g) => g.id)).toEqual(["y", "x"]);
	});

	it("候補が空 → 空配列。対象外の ID は無視する", () => {
		expect(run([task("a", TUE_END, 120)], [])).toEqual([]);
		expect(run([], ["a"])).toEqual([]);
		expect(run([task("a", TUE_END, 120)], ["zzz"])).toEqual([]);
	});

	it("candidateIds の重複は1件にまとめる", () => {
		const out = run([task("a", TUE_END, 120)], ["a", "a"]);
		expect(out).toHaveLength(1);
	});

	it("決定性: 同じ入力は完全に一致し、候補の並びに依存しない", () => {
		const tasks = [
			task("t3", THU_END, 90),
			task("t1", TUE_END, 90),
			task("t2", WED_END, 90),
			task("t4", WED_END, 90),
		];
		const a = run(tasks, ["t1", "t2", "t3", "t4"]);
		const b = run(tasks, ["t1", "t2", "t3", "t4"]);
		const c = run([...tasks].reverse(), ["t4", "t3", "t2", "t1"]);
		expect(b).toEqual(a);
		expect(c).toEqual(a);
	});

	it("同点は 締切が早い → 残りが多い → ID の順", () => {
		// 山場より前で締切が同じ。ストレスまで同点にするため残りも同じにして ID で決める
		const tasks = [task("b", TUE_END, 90), task("a", TUE_END, 90)];
		expect(run(tasks, ["b", "a"]).map((g) => g.id)).toEqual(["a", "b"]);
	});

	it("tau が大きいほどストレスの差は小さくなる", () => {
		const tasks = [task("a", TUE_END, 120), task("b", WED_END, 300)];
		const small = get(run(tasks, ["a"], { tau: 0.5 }), "a").stressDelta;
		const large = get(run(tasks, ["a"], { tau: 4 }), "a").stressDelta;
		expect(small).toBeLessThan(0);
		expect(large).toBeLessThan(0);
		expect(Math.abs(large)).toBeLessThan(Math.abs(small));
	});

	it("公開日時より前の空き時間は、そのタスクには使えない", () => {
		const tasks = [task("a", WED_END, 300, { releaseAt: jst("2026-10-13 09:00") }), task("b", WED_END, 300)];
		const out = run(tasks, ["a", "b"]);
		expect(get(out, "a").bottleneckDeltaMin).toBe(0);
		expect(get(out, "b").bottleneckDeltaMin).toBe(60);
		expect(out.map((g) => g.id)).toEqual(["b", "a"]);
	});

	it("workedToday は増やさない: 余裕リストでやった分は今日のキャパを消費せず、改善量はそのまま出る", () => {
		const tasks = [task("a", TUE_END, 120), task("b", WED_END, 300)];
		const out = run(tasks, ["a", "b"], { cap: { workedToday: 120 } });
		// 今日の残りキャパは 60 分。余裕リストでやった分は今日のキャパを消費しない
		expect(get(out, "a").bottleneckDeltaMin).toBe(60);
		expect(get(out, "b").bottleneckDeltaMin).toBe(60);
	});
});

describe("slackGain: 間に合わない件数", () => {
	it("全体が過負荷で、候補を片付ければ1件助かる → infeasibleDelta が負で先頭に来る", () => {
		// 水曜末までの普段のキャパは 180 × 3 = 540 分。570 分積んで、休むと 1 件外れる状況にする
		const tasks = [task("small", WED_END, 60), task("big", WED_END, 510)];
		const out = run(tasks, ["small", "big"], { spareMin: 60 });
		// 休んだ場合: 570 > 540 で big が外れて 1 件。small を 60 分やると 510 ≤ 540 で 0 件
		expect(get(out, "small").infeasibleDelta).toBe(-1);
		// big を 60 分やっても 510 ≤ 540 で 0 件
		expect(get(out, "big").infeasibleDelta).toBe(-1);
	});
});

describe("slackGain: big_block", () => {
	// 月曜 9:00〜12:00 は3時間続けて空いているが、12:00 以降は 90 分空き/90 分予定の繰り返しで細切れ
	const busy: Interval[] = [];
	for (let t = jst("2026-10-12 12:00"); t < jst(FRI_END); t += 3 * HOUR)
		busy.push({ start: t, end: t + 90 * MINUTE });
	const tasks = [
		// 締切の早い小さなタスク
		task("small", TUE_END, 60),
		// 120 分の塊が要るタスク。今ある 3 時間の空きを使わないと、120 分続く空きがなくなる
		task("big", THU_END, 120, { minBlock: 120 }),
	];

	it("将来の空きが細切れで minBlock 120 の候補がある → 締切の早い小さなタスクより上に来る", () => {
		const out = run(tasks, ["small", "big"], { spareMin: 90, cap: { busy } });
		expect(out.map((g) => g.id)).toEqual(["big", "small"]);
		expect(get(out, "big").reason).toBe("big_block");
		expect(get(out, "big").infeasibleDelta).toBe(-1);
		expect(get(out, "small").infeasibleDelta).toBe(0);
		expect(get(out, "small").reason).not.toBe("big_block");
	});

	it("空きが十分に連続しているなら big_block にならず、締切順になる", () => {
		const out = run(tasks, ["small", "big"], { spareMin: 90 });
		expect(out.map((g) => g.id)).toEqual(["small", "big"]);
		expect(get(out, "big").reason).not.toBe("big_block");
	});

	it("minBlock が 60 分未満なら、空きが細切れでも big_block にならない", () => {
		const out = run([task("small", TUE_END, 60, { minBlock: 30 })], ["small"], { spareMin: 90, cap: { busy } });
		expect(out[0].reason).not.toBe("big_block");
	});
});

describe("slackGain: 性能", () => {
	it("タスク30件・全員が候補・spareMin 60 で 200ms 未満", () => {
		const tasks: PlanTask[] = [];
		for (let i = 0; i < 30; i++) {
			tasks.push({
				id: `t${String(i).padStart(2, "0")}`,
				dueAt: NOW + (1 + (i % 14)) * DAY + (i % 5) * HOUR,
				remainingP80: 30 + ((i * 17) % 90),
				minBlock: i % 4 === 0 ? 90 : 30,
				uncertain: i % 7 === 0,
			});
		}
		const ids = tasks.map((t) => t.id);
		const t0 = performance.now();
		const out = run(tasks, ids, { spareMin: 60 });
		const elapsed = performance.now() - t0;
		expect(out).toHaveLength(30);
		expect(elapsed).toBeLessThan(200);
	});
});
