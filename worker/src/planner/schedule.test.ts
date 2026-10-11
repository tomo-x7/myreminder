import { describe, expect, it } from "vitest";
import { buildCapacity, type CapacityInput } from "./capacity";
import { type PlanTask, plan } from "./schedule";
import { DAY, HOUR, MINUTE } from "./types";

/** JST の "YYYY-MM-DD HH:MM" を epoch ms にする */
const jst = (s: string): number => {
	const [d, t] = s.split(" ");
	return Date.parse(`${d}T${t}:00+09:00`);
};
const range = (a: string, b: string) => ({ start: jst(a), end: jst(b) });

// 2026-10-12 は月曜。睡眠は 0:00〜8:00 なので、月曜の free は 9:00〜24:00(900分)、普段のキャパは 180 分/日
const NOW = jst("2026-10-12 09:00");
const MON_END = "2026-10-13 00:00"; // 月曜の終わり
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
const run = (tasks: PlanTask[], over: Partial<CapacityInput> = {}) =>
	plan({ now: NOW, tasks, capacity: buildCapacity(capInput(over)), marginRatio: 0.5 });
const byId = (out: ReturnType<typeof plan>, id: string) => {
	const t = out.tasks.find((x) => x.id === id);
	if (!t) throw new Error(`no task ${id}`);
	return t;
};

describe("plan: 基本", () => {
	it("タスクなし → tasks は空、bottleneck は null", () => {
		const out = run([]);
		expect(out).toEqual({ tasks: [], deadlines: [], bottleneck: null, overdue: [], dropCandidates: [] });
	});

	it("期限切れは overdue に入り、需要上限テストには含まれない", () => {
		const a = task("a", MON_END, 180);
		const withOverdue = run([
			task("o2", "2026-10-12 09:00", 600), // dueAt == now も期限切れ
			a,
			task("o1", "2026-10-12 08:00", 600),
		]);
		expect(withOverdue.overdue).toEqual(["o1", "o2"]);
		const alone = run([a]);
		expect(withOverdue.tasks).toEqual(alone.tasks);
		expect(withOverdue.deadlines).toEqual(alone.deadlines);
		expect(withOverdue.bottleneck).toEqual(alone.bottleneck);
	});

	it("1件でちょうど収まる → slack 0、risk は danger 以上", () => {
		const out = run([task("a", MON_END, 180)]);
		const a = byId(out, "a");
		expect(a.slackUsual).toBe(0);
		expect(a.slackHard).toBe(900 - 180);
		expect(["danger", "critical"]).toContain(a.risk);
		expect(a.risk).toBe("danger");
		expect(a.blocks).toEqual([range("2026-10-12 21:00", MON_END)]);
		expect(a.latestStartUsual).toBe(jst("2026-10-12 21:00"));
		expect(a.latestStartHard).toBe(jst("2026-10-12 21:00"));
		expect(a.needsFullEffort).toBe(false);
		expect(a.placementFailed).toBe(false);
		// 月曜の普段のキャパは使い切るので、遡れず now
		expect(a.recommendedStart).toBe(NOW);
		expect(out.deadlines).toEqual([{ dueAt: jst(MON_END), slackUsual: 0, slackHard: 720 }]);
		expect(out.bottleneck).toEqual({ dueAt: jst(MON_END), slackUsual: 0 });
		expect(out.dropCandidates).toEqual([]);
	});

	it("同じ締切のタスクが2件: 締切は1つにまとまり、id の小さい方が前に置かれる", () => {
		const out = run([task("b", TUE_END, 90), task("a", TUE_END, 60)]);
		expect(out.deadlines).toEqual([{ dueAt: jst(TUE_END), slackUsual: 210, slackHard: 1710 }]);
		expect(out.tasks.map((t) => t.id)).toEqual(["a", "b"]);
		const [a, b] = out.tasks;
		expect(a.slackUsual).toBe(210);
		expect(b.slackUsual).toBe(210);
		expect(b.blocks).toEqual([range("2026-10-13 22:30", TUE_END)]);
		expect(a.blocks).toEqual([range("2026-10-13 21:30", "2026-10-13 22:30")]);
		expect(a.latestStartUsual).toBe(jst("2026-10-13 21:30"));
		expect(a.risk).toBe("relaxed");
		expect(b.risk).toBe("relaxed");
		// a の margin は max(30, 0.5×60) = 30 分。火曜の普段のキャパは 180−150=30 分残っている
		expect(a.recommendedStart).toBe(jst("2026-10-13 21:00"));
	});

	it("タスクごとの余裕は、自分以降の締切の余裕の最小(EDL)", () => {
		const out = run([task("a", TUE_END, 100), task("b", WED_END, 400)]);
		expect(out.deadlines).toEqual([
			{ dueAt: jst(TUE_END), slackUsual: 260, slackHard: 1860 - 100 },
			{ dueAt: jst(WED_END), slackUsual: 540 - 500, slackHard: 900 + 960 + 960 - 500 },
		]);
		expect(byId(out, "a").slackUsual).toBe(40);
		expect(byId(out, "b").slackUsual).toBe(40);
		expect(out.bottleneck).toEqual({ dueAt: jst(WED_END), slackUsual: 40 });
	});
});

describe("plan: 普段と本気", () => {
	it("普段は無理・本気なら可 → needsFullEffort、risk は danger", () => {
		const out = run([task("c", MON_END, 300)]);
		const c = byId(out, "c");
		expect(c.slackUsual).toBe(-120);
		expect(c.slackHard).toBe(600);
		expect(c.needsFullEffort).toBe(true);
		expect(c.latestStartUsual).toBeNull();
		expect(c.latestStartHard).toBe(jst("2026-10-12 19:00"));
		expect(c.recommendedStart).toBeNull();
		expect(c.blocks).toEqual([range("2026-10-12 19:00", MON_END)]); // 本気のモードの配置
		expect(c.placementFailed).toBe(false);
		expect(c.risk).toBe("danger");
		expect(out.dropCandidates).toEqual([]);
	});

	it("workedToday で今日の普段のキャパが減ると、普段は無理になる", () => {
		const out = run([task("a", MON_END, 120)], { workedToday: 100 });
		const a = byId(out, "a");
		expect(a.slackUsual).toBe(80 - 120);
		expect(a.needsFullEffort).toBe(true);
		expect(a.risk).toBe("danger");
	});

	it("本気でも無理 → critical、dropCandidates に一番長いタスクが入る", () => {
		const out = run([task("x", MON_END, 500), task("y", MON_END, 700)]);
		expect(out.deadlines[0].slackHard).toBe(900 - 1200);
		expect(out.tasks.map((t) => t.risk)).toEqual(["critical", "critical"]);
		expect(out.dropCandidates).toEqual(["y"]);
		expect(byId(out, "x").needsFullEffort).toBe(false);
	});

	it("Moore–Hodgson: 同点は締切が遅い方 → id 昇順で外す", () => {
		// 長さが同じ → 締切が遅い b を外す
		const out1 = run([task("a", "2026-10-12 23:00", 500), task("b", MON_END, 500)]);
		expect(out1.dropCandidates).toEqual(["b"]);
		// 締切も同じ → id の小さい a を外す
		const out2 = run([task("b", MON_END, 500), task("a", MON_END, 500)]);
		expect(out2.dropCandidates).toEqual(["a"]);
	});

	it("Moore–Hodgson: 外したあとの累積で判定を続ける", () => {
		// 締切順は b(23:00) → a(24:00) → c(火曜)。b:300 ≤ 840、a を足して 1100 > 900 → 最大の a を外す。
		// 残りは 300 + 900 = 1200 ≤ 1860 なので c は残る
		const out = run([task("a", MON_END, 800), task("b", "2026-10-12 23:00", 300), task("c", TUE_END, 900)]);
		expect(out.dropCandidates).toEqual(["a"]);
	});

	it("全部収まっていれば dropCandidates は空", () => {
		expect(run([task("a", MON_END, 500)]).dropCandidates).toEqual([]);
	});
});

describe("plan: 配置の制約", () => {
	// 月曜 9:00〜24:00 を、毎時 45〜60 分が予定で埋まった「45分の空き」にする
	const choppy = (): Partial<CapacityInput> => ({
		busy: Array.from({ length: 15 }, (_, i) => {
			const start = NOW + i * HOUR + 45 * MINUTE;
			return { start, end: start + 15 * MINUTE };
		}),
	});

	it("minBlock がどの空きより長い → placementFailed、risk は danger 以上", () => {
		const out = run([task("a", MON_END, 60, { minBlock: 60 })], choppy());
		const a = byId(out, "a");
		expect(a.slackUsual).toBeGreaterThanOrEqual(0);
		expect(a.slackHard).toBeGreaterThanOrEqual(0);
		expect(a.placementFailed).toBe(true);
		expect(a.latestStartUsual).toBeNull();
		expect(a.latestStartHard).toBeNull();
		expect(a.blocks).toEqual([]);
		expect(["danger", "critical"]).toContain(a.risk);
		expect(a.needsFullEffort).toBe(false);
	});

	it("残りが minBlock 未満になったら、その残りの長さ以上の空きは使える", () => {
		const out = run([task("a", MON_END, 60, { minBlock: 30 })], choppy());
		const a = byId(out, "a");
		expect(a.placementFailed).toBe(false);
		// 23:00〜23:45 の 45 分を取り、残り 15 分は 22:30〜22:45
		expect(a.blocks).toEqual([
			range("2026-10-12 22:30", "2026-10-12 22:45"),
			range("2026-10-12 23:00", "2026-10-12 23:45"),
		]);
		expect(a.latestStartUsual).toBe(jst("2026-10-12 22:30"));
	});

	it("minBlock 未満の断片は飛ばす", () => {
		// 空きは 45 分。minBlock 50 の 100 分は置けない(どの断片も 50 に届かない)が、minBlock 45 なら 45+45+10 で置ける
		const ng = run([task("a", MON_END, 100, { minBlock: 50 })], choppy());
		expect(byId(ng, "a").placementFailed).toBe(true);
		const ok = byId(run([task("a", MON_END, 100, { minBlock: 45 })], choppy()), "a");
		// 45 + 45 のあと残り 10 分(< minBlock なので 10 分以上の空きなら使える): 23:00〜23:45、22:00〜22:45、21:35〜21:45
		expect(ok.blocks).toEqual([
			range("2026-10-12 21:35", "2026-10-12 21:45"),
			range("2026-10-12 22:00", "2026-10-12 22:45"),
			range("2026-10-12 23:00", "2026-10-12 23:45"),
		]);
	});

	it("releaseAt が着手デッドラインより後 → latestStart は null、placementFailed", () => {
		const out = run([task("a", MON_END, 60, { releaseAt: jst("2026-10-12 23:30") })]);
		const a = byId(out, "a");
		expect(a.slackUsual).toBeGreaterThanOrEqual(0); // 需要上限テストは releaseAt を見ない
		expect(a.latestStartUsual).toBeNull();
		expect(a.latestStartHard).toBeNull();
		expect(a.placementFailed).toBe(true);
		expect(a.risk).toBe("critical");
	});

	it("releaseAt より前には置かない", () => {
		const out = run([task("a", MON_END, 300, { releaseAt: jst("2026-10-12 20:00") })]);
		const a = byId(out, "a");
		// 20:00〜24:00 は 240 分しかなく 300 分は置けない(普段は元々無理)
		expect(a.latestStartHard).toBeNull();
		const ok = run([task("a", MON_END, 200, { releaseAt: jst("2026-10-12 20:30") })]);
		expect(byId(ok, "a").latestStartHard).toBe(jst("2026-10-12 20:40"));
		const early = run([task("a", MON_END, 100, { releaseAt: jst("2026-10-12 22:00") })]);
		expect(byId(early, "a").latestStartUsual).toBe(jst("2026-10-12 22:20"));
	});

	it("普段のモードは活動日ごとの上限を超えて置かない", () => {
		const out = run([task("a", TUE_END, 300)]);
		const a = byId(out, "a");
		// 火曜に 180、月曜に 120(月曜の後ろから)
		expect(a.blocks).toEqual([range("2026-10-12 22:00", MON_END), range("2026-10-13 21:00", TUE_END)]);
		expect(a.latestStartUsual).toBe(jst("2026-10-12 22:00"));
	});

	it("本気のモードの配置は睡眠をまたいで日をまたぐ", () => {
		const out = run([task("a", TUE_END, 1500)]);
		const a = byId(out, "a");
		expect(a.slackUsual).toBeLessThan(0);
		expect(a.blocks).toEqual([range("2026-10-12 15:00", MON_END), range("2026-10-13 08:00", TUE_END)]);
		expect(a.latestStartHard).toBe(jst("2026-10-12 15:00"));
	});

	it("睡眠時間帯・予定にブロックが置かれず、タスク同士も重ならない", () => {
		const input = capInput({
			horizonDays: 5,
			busy: [range("2026-10-12 12:00", "2026-10-12 14:00"), range("2026-10-13 09:00", "2026-10-13 18:00")],
			sleep: { startMin: 23 * 60 + 30, endMin: 7 * 60 }, // 日をまたぐ睡眠
		});
		const capacity = buildCapacity(input);
		for (const sizes of [
			[200, 250, 300],
			[1000, 900, 800],
		]) {
			const tasks = sizes.map((p, i) => task(`t${i}`, `2026-10-1${4 + i} 00:00`, p));
			const out = plan({ now: NOW, tasks, capacity, marginRatio: 0.5 });
			const blocks = out.tasks.flatMap((t) => t.blocks).sort((a, b) => a.start - b.start);
			for (const b of blocks) {
				expect(capacity.free.some((f) => f.start <= b.start && b.end <= f.end)).toBe(true);
			}
			// 普段と本気の配置が混ざると別々の計算なので重なりうる。全部が普段で置けた場合だけ見る
			if (out.tasks.every((t) => !t.needsFullEffort && t.latestStartUsual !== null)) {
				for (let i = 1; i < blocks.length; i++)
					expect(blocks[i].start).toBeGreaterThanOrEqual(blocks[i - 1].end);
			}
		}
	});
});

describe("plan: リスクの段階", () => {
	it("締切まで3時間以内は critical(ちょうど3時間も含む)", () => {
		const a = byId(run([task("a", "2026-10-12 12:00", 30)]), "a");
		expect(a.risk).toBe("critical");
		const b = byId(run([task("b", "2026-10-12 12:01", 30)]), "b");
		expect(b.risk).toBe("danger"); // 3時間を少し超えるが、着手デッドラインが24時間以内
	});

	it("余裕が 2×残りP80 未満で、着手デッドラインが24時間より先なら watch", () => {
		const out = run([task("a", THU_END, 500)]);
		const a = byId(out, "a");
		expect(a.slackUsual).toBe(720 - 500);
		expect(a.blocks).toEqual([
			range("2026-10-13 21:40", TUE_END),
			range("2026-10-14 21:00", WED_END),
			range("2026-10-15 21:00", THU_END),
		]);
		expect(a.latestStartUsual).toBe(jst("2026-10-13 21:40"));
		expect(a.risk).toBe("watch");
	});

	it("余裕が十分なら relaxed。おすすめ着手時刻は latestStart より margin 前", () => {
		const a = byId(run([task("a", FRI_END, 60)]), "a");
		expect(a.slackUsual).toBe(5 * 180 - 60);
		expect(a.latestStartUsual).toBe(jst("2026-10-16 23:00"));
		expect(a.risk).toBe("relaxed");
		expect(a.recommendedStart).toBe(jst("2026-10-16 22:30"));
	});

	it("margin は max(30, marginRatio × P80)。その日の普段のキャパが足りなければ前の日まで遡る", () => {
		const at = (marginRatio: number) =>
			plan({ now: NOW, tasks: [task("a", FRI_END, 100)], capacity: buildCapacity(capInput()), marginRatio })
				.tasks[0];
		// P80=100 は金曜 22:20〜24:00 に置かれ、金曜のキャパは 80 分残る
		expect(at(0.5).latestStartUsual).toBe(jst("2026-10-16 22:20"));
		expect(at(0.5).recommendedStart).toBe(jst("2026-10-16 21:30")); // 50 分
		expect(at(0.1).recommendedStart).toBe(jst("2026-10-16 21:50")); // 下限 30 分
		expect(at(1).recommendedStart).toBe(jst("2026-10-15 23:40")); // 100 分 = 金曜 80 分 + 木曜の後ろ 20 分
	});
});

describe("plan: おすすめ着手時刻と公開日時", () => {
	it("遡る下限は max(now, releaseAt)。公開前の時刻にはならない", () => {
		// 火曜 10:00 公開・13:00 締切・150 分。着手デッドラインは 10:30 で、margin 75 分は公開日時までしか遡れない
		const release = jst("2026-10-13 10:00");
		const a = byId(run([task("a", "2026-10-13 13:00", 150, { releaseAt: release })]), "a");
		expect(a.latestStartUsual).toBe(jst("2026-10-13 10:30"));
		expect(a.recommendedStart).toBe(release);
	});

	it("公開日時が過ぎていれば、これまでどおり now が下限", () => {
		const a = byId(run([task("a", "2026-10-12 12:00", 150, { releaseAt: jst("2026-10-01 00:00") })]), "a");
		expect(a.recommendedStart).toBe(NOW);
	});
});

describe("plan: 性質", () => {
	const base = [
		task("t1", "2026-10-13 12:00", 100),
		task("t2", "2026-10-14 12:00", 200),
		task("t3", "2026-10-15 12:00", 150),
	];

	it("締切が遅いタスクを足しても、締切が早いタスクの slack は増えない(単調性)", () => {
		const before = run(base);
		for (const extra of [
			task("e", "2026-10-15 13:00", 1),
			task("e", "2026-10-16 12:00", 500),
			task("e", "2026-10-20 12:00", 3000),
			task("e", "2026-10-15 13:00", 900),
		]) {
			const after = run([...base, extra]);
			for (const t of before.tasks) {
				const t2 = byId(after, t.id);
				expect(t2.slackUsual).toBeLessThanOrEqual(t.slackUsual);
				expect(t2.slackHard).toBeLessThanOrEqual(t.slackHard);
			}
		}
	});

	it("同じ入力なら出力が完全に一致する。タスクの渡し順にも依存しない", () => {
		const tasks = [...base, task("t4", "2026-10-15 12:00", 150), task("t0", "2026-10-13 12:00", 100)];
		const a = run(tasks);
		expect(run(tasks)).toEqual(a);
		expect(run([...tasks].reverse())).toEqual(a);
		expect(run([tasks[2], tasks[0], tasks[4], tasks[1], tasks[3]])).toEqual(a);
	});
});

describe("plan: 速度", () => {
	it("30件・14日のplanを31回呼んでも十分速い(緩い目安)", () => {
		const busy = Array.from({ length: 14 }, (_, d) => ({
			start: NOW + d * DAY + HOUR,
			end: NOW + d * DAY + 3 * HOUR,
		})).concat(
			Array.from({ length: 14 }, (_, d) => ({ start: NOW + d * DAY + 6 * HOUR, end: NOW + d * DAY + 7 * HOUR })),
		);
		const capacity = buildCapacity(capInput({ busy }));
		const tasks: PlanTask[] = Array.from({ length: 30 }, (_, i) => ({
			id: `t${String(i).padStart(2, "0")}`,
			dueAt: NOW + ((i % 14) + 1) * DAY + (i % 5) * HOUR,
			remainingP80: 60 + (i % 7) * 30,
			minBlock: i % 4 === 0 ? 60 : 30,
			releaseAt: i % 6 === 0 ? NOW + DAY : undefined,
		}));
		const input = { now: NOW, tasks, capacity, marginRatio: 0.5 };
		const t0 = performance.now();
		for (let i = 0; i < 31; i++) plan(input);
		const elapsed = performance.now() - t0;
		expect(plan(input).tasks).toHaveLength(30);
		expect(elapsed).toBeLessThan(200);
	});
});
