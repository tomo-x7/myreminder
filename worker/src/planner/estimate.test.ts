import { describe, expect, it } from "vitest";
import {
	DEFAULT_PRIOR,
	type EstimateKey,
	estimateBasis,
	fitEstimateModel,
	planningMultiplier,
	referenceSamples,
	type Sample,
	tQuantile,
	uncertainty,
} from "./estimate";
import type { Category } from "./types";

const DAY_MS = 86_400_000;

/** completedAt は i が大きいほど新しい。実績 = 見積もり × ratio */
function sample(i: number, ratio: number, o: Partial<Sample> = {}): Sample {
	const estimateMin = o.estimateMin ?? 120;
	return {
		category: "report",
		courseId: null,
		seriesId: null,
		estimateMin,
		actualMin: estimateMin * ratio,
		completedAt: i * DAY_MS,
		...o,
	};
}

function many(n: number, ratio: number, o: Partial<Sample> = {}, offset = 0): Sample[] {
	return Array.from({ length: n }, (_, i) => sample(offset + i, ratio, o));
}

function key(
	courseId: string | null = null,
	seriesId: string | null = null,
	category: Category = "report",
): EstimateKey {
	return { category, courseId, seriesId };
}

const NONE = key();
/** 予測の中心(q = 0.5) */
const center = (model: ReturnType<typeof fitEstimateModel>, k: EstimateKey, estimateMin = 120) =>
	planningMultiplier(model, k, estimateMin, 0.5);

describe("tQuantile", () => {
	// 標準的な t 分布表の値(±0.01)
	const table: [number, number, number][] = [
		[3, 0.8, 0.9785],
		[5, 0.8, 0.9195],
		[10, 0.8, 0.8791],
		[30, 0.8, 0.8538],
		[3, 0.9, 1.6377],
		[5, 0.9, 1.4759],
		[10, 0.9, 1.3722],
		[30, 0.9, 1.3104],
		[1, 0.8, 1.3764],
		[2, 0.8, 1.0607],
	];
	for (const [df, q, expected] of table) {
		it(`t_${df}(${q}) ≈ ${expected}`, () => {
			expect(Math.abs(tQuantile(q, df) - expected)).toBeLessThan(0.01);
		});
	}

	it("下側は符号が反転し、0.5 は 0", () => {
		expect(tQuantile(0.5, 5)).toBe(0);
		expect(tQuantile(0.2, 5)).toBeCloseTo(-tQuantile(0.8, 5), 10);
	});

	it("非整数の自由度は隣り合う整数の間に入り、df が増えると正規分布(0.8416)に近づく", () => {
		const v = tQuantile(0.8, 4.5);
		expect(v).toBeLessThan(tQuantile(0.8, 4));
		expect(v).toBeGreaterThan(tQuantile(0.8, 5));
		expect(tQuantile(0.8, 1e5)).toBeCloseTo(0.8416, 3);
	});

	it("q が端のとき", () => {
		expect(tQuantile(1, 3)).toBe(Number.POSITIVE_INFINITY);
		expect(tQuantile(0, 3)).toBe(Number.NEGATIVE_INFINITY);
		expect(tQuantile(0.999, 3)).toBeGreaterThan(tQuantile(0.99, 3));
	});
});

describe("fitEstimateModel: 事前分布と切り方", () => {
	it("サンプルが0件なら事前分布だけで決まる。キーによらない", () => {
		const model = fitEstimateModel([]);
		const expected = 1.3 * Math.exp(0.9785 * 0.5 * Math.sqrt(4 / 3));
		const got = planningMultiplier(model, NONE, 60);
		expect(got).toBeCloseTo(2.29, 2);
		expect(Math.abs(Math.log(got / expected))).toBeLessThan(0.01);
		expect(uncertainty(model, NONE)).toBeCloseTo(0.5 * Math.sqrt(4 / 3), 10);
		// 見積もりの長さ・種類・科目・繰り返しによらない
		expect(planningMultiplier(model, key("a", "s", "quiz"), 600)).toBe(got);
		expect(center(model, NONE, 60)).toBeCloseTo(Math.exp(DEFAULT_PRIOR.mu0), 10);
		expect(model.slope).toBe(1);
		expect(estimateBasis(model, key("a", "s"))).toEqual({ level: "prior", count: 0 });
	});

	it("比率がすべて 1.0 のサンプルが多数なら、倍率は 1.0 付近で、事前分布より下がる", () => {
		const prior = planningMultiplier(fitEstimateModel([]), NONE, 120);
		const m100 = fitEstimateModel(many(100, 1));
		const m10 = fitEstimateModel(many(10, 1));
		expect(center(m100, NONE)).toBeCloseTo(1, 1);
		expect(planningMultiplier(m100, NONE, 120)).toBeLessThan(planningMultiplier(m10, NONE, 120));
		expect(planningMultiplier(m10, NONE, 120)).toBeLessThan(prior);
	});

	it("比率がすべて 0.5 のサンプルが多数なら、倍率は 1.0 を下回る。clip の下限 0.2 は下回らない", () => {
		const model = fitEstimateModel(many(60, 0.5));
		expect(planningMultiplier(model, NONE, 120)).toBeLessThan(1);
		expect(planningMultiplier(model, NONE, 120)).toBeGreaterThan(0.2);
		// 0.2 より小さい比率は 0.2 に切られ、分位を下げても 0.2 で止まる
		const tiny = fitEstimateModel(many(60, 0.001));
		expect(planningMultiplier(tiny, NONE, 120, 0.0001)).toBe(0.2);
		expect(tiny.global).toEqual(fitEstimateModel(many(60, 0.2)).global);
	});

	it("比率 20 のサンプルは 5 に切られる", () => {
		const a = fitEstimateModel(many(5, 20));
		const b = fitEstimateModel(many(5, 5));
		expect(a.global).toEqual(b.global);
		expect(planningMultiplier(a, NONE, 120)).toBe(planningMultiplier(b, NONE, 120));
		// 倍率もこの範囲に収める
		expect(planningMultiplier(a, NONE, 120, 0.99)).toBe(5);
		expect(planningMultiplier(fitEstimateModel([]), NONE, 120, 0.9999)).toBe(5);
	});

	it("不正なサンプル(0以下・NaN)は無視する", () => {
		const good = many(5, 1.5);
		const bad: Sample[] = [
			sample(100, 1, { estimateMin: 0, actualMin: 10 }),
			sample(100, 1, { estimateMin: 10, actualMin: 0 }),
			sample(100, 1, { estimateMin: -5, actualMin: 10 }),
			sample(100, 1, { estimateMin: Number.NaN, actualMin: 10 }),
			sample(100, 1, { estimateMin: 10, actualMin: Number.POSITIVE_INFINITY }),
		];
		expect(fitEstimateModel([...bad, ...good])).toEqual(fitEstimateModel(good));
	});
});

describe("fitEstimateModel: 段階", () => {
	it("サンプルがない段階は、上の段階の値になる", () => {
		const model = fitEstimateModel(many(20, 2, { category: "report", courseId: "A", seriesId: "S" }));
		// 種類にサンプルがなければ全体の値。種類・科目・繰り返しによらない
		const quiz = key("X", "Y", "quiz");
		expect(planningMultiplier(model, quiz, 30)).toBe(planningMultiplier(model, key(null, null, "other"), 30));
		expect(uncertainty(model, quiz)).toBe(uncertainty(model, key(null, null, "other")));
		expect(estimateBasis(model, quiz)).toEqual({ level: "global", count: 20 });
		// 種類にだけサンプルがあれば、科目・繰り返しが違っても種類の値
		expect(planningMultiplier(model, key("B", "T"), 120)).toBe(planningMultiplier(model, NONE, 120));
		expect(estimateBasis(model, key("B", "T"))).toEqual({ level: "category", count: 20 });
		// 科目にサンプルがあり、繰り返しにはなければ科目の値
		expect(planningMultiplier(model, key("A", "T"), 120)).toBe(planningMultiplier(model, key("A"), 120));
		expect(estimateBasis(model, key("A", "T"))).toEqual({ level: "course", count: 20 });
		expect(estimateBasis(model, key("A", "S"))).toEqual({ level: "series", count: 20 });
		// 科目なし・繰り返しなしのタスクは、その段階を飛ばす
		expect(estimateBasis(model, NONE)).toEqual({ level: "category", count: 20 });
	});

	it("新しいサンプルほど効く", () => {
		const oldTwoNewOne = [...many(10, 2, {}, 0), ...many(10, 1, {}, 10)];
		const oldOneNewTwo = [...many(10, 1, {}, 0), ...many(10, 2, {}, 10)];
		const a = center(fitEstimateModel(oldTwoNewOne), NONE);
		const b = center(fitEstimateModel(oldOneNewTwo), NONE);
		expect(a).toBeLessThan(b);
		// 単純平均(√2)より、新しい側に寄る
		expect(a).toBeLessThan(Math.SQRT2);
		expect(b).toBeGreaterThan(Math.SQRT2);
	});

	it("科目のサンプルが少ないうちは種類に寄り、増えるにつれて科目の値に近づく", () => {
		const base = many(40, 1);
		// 科目の値(比率 3)までの ln の距離
		const distance = (n: number, shrinkK = 5) => {
			const model = fitEstimateModel([...base, ...many(n, 3, { courseId: "A" }, 100)], DEFAULT_PRIOR, {
				shrinkK,
			});
			return Math.log(3) - Math.log(center(model, key("A")));
		};
		// 1件だけなら、科目の値よりずっと種類(ほぼ 1.0)に近い
		expect(distance(1)).toBeGreaterThan((Math.log(3) * 3) / 4);
		expect(distance(1)).toBeLessThan(Math.log(3));
		expect(distance(5)).toBeLessThan(distance(1));
		expect(distance(20)).toBeLessThan(distance(5));
		expect(distance(20)).toBeGreaterThan(0);
		// shrinkK が大きいほど種類に寄る
		expect(distance(3, 20)).toBeGreaterThan(distance(3, 5));
		expect(distance(3, 5)).toBeGreaterThan(distance(3, 1));
	});

	it("繰り返しのサンプルが少ないうちは科目に寄り、増えるにつれて繰り返しの値に近づく", () => {
		const base = many(40, 1, { courseId: "A" });
		const distance = (n: number, shrinkK = 5) => {
			const model = fitEstimateModel(
				[...base, ...many(n, 3, { courseId: "A", seriesId: "S" }, 100)],
				DEFAULT_PRIOR,
				{
					shrinkK,
				},
			);
			return Math.log(3) - Math.log(center(model, key("A", "S")));
		};
		expect(distance(1)).toBeGreaterThan((Math.log(3) * 3) / 4);
		expect(distance(1)).toBeLessThan(Math.log(3));
		expect(distance(5)).toBeLessThan(distance(1));
		expect(distance(20)).toBeLessThan(distance(5));
		expect(distance(20)).toBeGreaterThan(0);
		expect(distance(3, 20)).toBeGreaterThan(distance(3, 5));
	});

	it("科目 A の比率 0.5 と科目 B の比率 2.0 は、同じ種類でも倍率が分かれる", () => {
		const samples = [
			...many(10, 0.5, { courseId: "A" }).map((s, i) => ({ ...s, completedAt: 2 * i * DAY_MS })),
			...many(10, 2, { courseId: "B" }).map((s, i) => ({ ...s, completedAt: (2 * i + 1) * DAY_MS })),
		];
		const model = fitEstimateModel(samples);
		const a = center(model, key("A"));
		const b = center(model, key("B"));
		expect(a).toBeLessThan(1);
		expect(b).toBeGreaterThan(1);
		expect(planningMultiplier(model, key("A"), 120)).toBeLessThan(planningMultiplier(model, key("B"), 120));
		// 科目なしのタスクは種類の値で、両者の間
		expect(center(model, NONE)).toBeGreaterThan(a);
		expect(center(model, NONE)).toBeLessThan(b);
		// 別の種類の同じ科目 id は、別の科目として扱う
		expect(estimateBasis(model, key("A", null, "quiz"))).toEqual({ level: "global", count: 20 });
	});

	it("同じシリーズの実績が3件あれば、同じ科目の別の課題より、そのシリーズの値に近い", () => {
		const samples = [...many(10, 1, { courseId: "A" }), ...many(3, 2, { courseId: "A", seriesId: "S" }, 10)];
		const model = fitEstimateModel(samples);
		const series = center(model, key("A", "S"));
		const course = center(model, key("A"));
		expect(series).toBeGreaterThan(course);
		expect(Math.abs(Math.log(series / 2))).toBeLessThan(Math.abs(Math.log(course / 2)));
		expect(estimateBasis(model, key("A", "S"))).toEqual({ level: "series", count: 3 });
		expect(estimateBasis(model, key("A"))).toEqual({ level: "course", count: 13 });
	});
});

describe("fitEstimateModel: 傾き", () => {
	// 見積もりの長さがばらけたデータ。比率が clip の範囲に収まるよう 15〜240 分
	const ests = [15, 30, 60, 120, 240];
	const series = (n: number, actual: (est: number) => number, o: Partial<Sample> = {}) =>
		Array.from({ length: n }, (_, i) => {
			const est = ests[i % ests.length] as number;
			return sample(i, actual(est) / est, { estimateMin: est, ...o });
		});

	it("実績が見積もりに比例するデータなら b ≈ 1", () => {
		const model = fitEstimateModel(series(30, (est) => est * 1.5, { courseId: "A" }));
		expect(model.slope).toBeCloseTo(1, 10);
	});

	it("見積もりによらず実績が一定のデータ(まとまりの中で見積もりが違う)なら b は 0 に近づく", () => {
		const few = fitEstimateModel(series(5, () => 60, { courseId: "A" }));
		const more = fitEstimateModel(series(30, () => 60, { courseId: "A" }));
		expect(more.slope).toBeLessThan(0.1);
		expect(more.slope).toBeLessThan(few.slope);
		expect(few.slope).toBeLessThan(1);
		// 予測は「いつもの 60 分」に寄る(比例なら 8 倍違うはずの 30 分と 240 分で、予測の実績がほぼ同じ)
		const at = (est: number) => est * center(more, key("A"), est);
		expect(at(30)).toBeGreaterThan(45);
		expect(at(30)).toBeLessThan(90);
		expect(at(240) / at(30)).toBeLessThan(1.5);
	});

	it("まとまり(種類 × 科目)の中で回帰する。まとまり同士の水準の違いは傾きに入れない", () => {
		// 科目 A はいつも 60 分、科目 B はいつも 480 分。ひとまとめに見ると「見積もりが長いほど実績が長い」ように見える
		const samples: Sample[] = [];
		for (let i = 0; i < 30; i++) {
			const a = ests[i % 5] as number;
			const b = (ests[i % 5] as number) * 8;
			samples.push(sample(2 * i, 60 / a, { courseId: "A", estimateMin: a }));
			samples.push(sample(2 * i + 1, 480 / b, { courseId: "B", estimateMin: b }));
		}
		expect(fitEstimateModel(samples).slope).toBeLessThan(0.1);
		expect(fitEstimateModel(samples.map((s) => ({ ...s, courseId: null }))).slope).toBeGreaterThan(0.5);
	});

	it("見積もりが全部同じ(繰り返しの回など)なら b に効かず 1 のまま。データが少ないうちも 1 に近い", () => {
		expect(fitEstimateModel(many(20, 0.5, { courseId: "A", seriesId: "S" })).slope).toBe(1);
		expect(fitEstimateModel([]).slope).toBe(1);
		const one = fitEstimateModel([sample(0, 0.5, { estimateMin: 30 })]);
		expect(one.slope).toBe(1);
		// 見積もりが少ししか違わない2件では、傾きが決まらないので 1 に近い
		const two = fitEstimateModel([sample(0, 1, { estimateMin: 60 }), sample(1, 60 / 90, { estimateMin: 90 })]);
		expect(two.slope).toBeGreaterThan(0.85);
	});

	it("[0, 1] に収まる", () => {
		// 見積もりが長いほど実績が短い → 負になるところを 0 に
		const inverse = fitEstimateModel(series(30, (est) => 60 ** 2 / est, { courseId: "A" }));
		expect(inverse.slope).toBe(0);
		// 見積もりが長いほど比率が増える → 1 を超えるところを 1 に
		const steep = fitEstimateModel(series(30, (est) => est ** 1.2 / 8, { courseId: "A" }));
		expect(steep.slope).toBe(1);
	});

	it("slopePrior が大きいほど 1 に寄る", () => {
		const s = series(15, () => 60, { courseId: "A" });
		const weak = fitEstimateModel(s, DEFAULT_PRIOR, { slopePrior: 0.1 });
		const strong = fitEstimateModel(s, DEFAULT_PRIOR, { slopePrior: 20 });
		expect(weak.slope).toBeLessThan(strong.slope);
	});
});

describe("予測", () => {
	it("例: 科目 A で見積もり 1h → 実績 30m が3件のあと、見積もり 30m の予測の中心は 30m より短い", () => {
		const model = fitEstimateModel(many(3, 0.5, { category: "exercise", courseId: "A", estimateMin: 60 }));
		const k = key("A", null, "exercise");
		// 見積もりが全部同じなので b は決まらず 1
		expect(model.slope).toBe(1);
		const mid = 30 * center(model, k, 30);
		expect(mid).toBeLessThan(30);
		expect(mid).toBeGreaterThan(30 * 0.5);
		// P80 はそれより長い。ただし見積もりの 30m よりは短い(下限 ×1.0 はない)
		const p80 = 30 * planningMultiplier(model, k, 30);
		expect(p80).toBeGreaterThan(mid);
		expect(p80).toBeLessThan(30);
		// 見積もりが同じなら、見積もりを変えても倍率は同じ(b = 1)
		expect(planningMultiplier(model, k, 30)).toBe(planningMultiplier(model, k, 90));
	});

	it("estimateBasis は一番下のサンプルのある段階と件数を返す", () => {
		const model = fitEstimateModel([
			...many(4, 1, { courseId: "A", seriesId: "S" }),
			...many(2, 1, { courseId: "A" }, 10),
			...many(3, 1, { category: "quiz" }, 20),
			sample(30, 1, { estimateMin: 0 }),
		]);
		expect(estimateBasis(model, key("A", "S"))).toEqual({ level: "series", count: 4 });
		expect(estimateBasis(model, key("A", "Z"))).toEqual({ level: "course", count: 6 });
		expect(estimateBasis(model, key("B"))).toEqual({ level: "category", count: 6 });
		expect(estimateBasis(model, key(null, null, "quiz"))).toEqual({ level: "category", count: 3 });
		expect(estimateBasis(model, key(null, null, "other"))).toEqual({ level: "global", count: 9 });
	});

	it("q を上げると倍率が増える。同じ入力なら結果は同じ", () => {
		const s = many(12, 1.5, { courseId: "A" });
		const m = fitEstimateModel(s);
		const k = key("A");
		expect(planningMultiplier(m, k, 120, 0.9)).toBeGreaterThan(planningMultiplier(m, k, 120, 0.8));
		expect(planningMultiplier(m, k, 120, 0.8)).toBeGreaterThan(planningMultiplier(m, k, 120, 0.5));
		expect(planningMultiplier(fitEstimateModel(s), k, 120)).toBe(planningMultiplier(m, k, 120));
		expect(uncertainty(fitEstimateModel(s), k)).toBe(uncertainty(m, k));
	});

	it("サンプルが増えるほど不確かさが小さくなる", () => {
		expect(uncertainty(fitEstimateModel(many(30, 1.5)), NONE)).toBeLessThan(
			uncertainty(fitEstimateModel([]), NONE),
		);
	});
});

describe("入力の並び", () => {
	const mixed = [
		...many(10, 2, { courseId: "A", estimateMin: 60 }, 0),
		...many(10, 1, { courseId: "A", seriesId: "S", estimateMin: 180 }, 10),
		...many(6, 0.7, { category: "quiz", estimateMin: 30 }, 20),
	];

	it("入力の並びに依らない(completedAt で新旧を決める)", () => {
		const reversed = [...mixed].reverse();
		const rotated = [...mixed.slice(7), ...mixed.slice(0, 7)];
		expect(fitEstimateModel(reversed)).toEqual(fitEstimateModel(mixed));
		expect(fitEstimateModel(rotated)).toEqual(fitEstimateModel(mixed));
		expect(planningMultiplier(fitEstimateModel(reversed), key("A", "S"), 100)).toBe(
			planningMultiplier(fitEstimateModel(mixed), key("A", "S"), 100),
		);
	});

	it("completedAt が同じサンプルがあっても、並びに依らない", () => {
		const tied = [
			sample(1, 2, { courseId: "A", estimateMin: 60 }),
			sample(1, 0.5, { courseId: "A", estimateMin: 120 }),
			sample(1, 1, { courseId: "B", estimateMin: 30 }),
			sample(1, 3, { category: "quiz", seriesId: "S", estimateMin: 45 }),
			sample(1, 1.2, { courseId: "A", estimateMin: 60 }),
		];
		const model = fitEstimateModel(tied);
		expect(fitEstimateModel([...tied].reverse())).toEqual(model);
		expect(fitEstimateModel([tied[2], tied[4], tied[0], tied[3], tied[1]] as Sample[])).toEqual(model);
	});
});

describe("referenceSamples", () => {
	type Row = Sample & { taskId: string };
	const row = (taskId: string, i: number, o: Partial<Sample> = {}): Row => ({ taskId, ...sample(i, 1, o) });
	const rows: Row[] = [
		row("a1", 1, { courseId: "A", seriesId: "S" }),
		row("a2", 2, { courseId: "A", seriesId: "S" }),
		row("a3", 3, { courseId: "A" }),
		row("a4", 4, { courseId: "A" }),
		row("a5", 5, { courseId: "A", seriesId: "S" }),
		row("a6", 6, { courseId: "A", seriesId: "S" }),
		row("b1", 7, { courseId: "B" }),
		row("n1", 8),
		row("q1", 9, { category: "quiz", courseId: "A" }),
	];
	const ids = (r: { items: Row[] }) => r.items.map((x) => x.taskId);

	it("series → course → category の順に探し、新しい順に limit 件", () => {
		expect(referenceSamples(rows, key("A", "S"), 3)).toMatchObject({ level: "series" });
		expect(ids(referenceSamples(rows, key("A", "S"), 3))).toEqual(["a6", "a5", "a2"]);
		expect(referenceSamples(rows, key("A"), 3).level).toBe("course");
		// 種類が違えば、同じ科目 id でも別
		expect(ids(referenceSamples(rows, key("A"), 3))).toEqual(["a6", "a5", "a4"]);
		expect(referenceSamples(rows, key("A", "Z", "quiz"), 3).level).toBe("course");
		expect(ids(referenceSamples(rows, key("A", "Z", "quiz"), 3))).toEqual(["q1"]);
		const cat = referenceSamples(rows, key(null, null), 3);
		expect(cat.level).toBe("category");
		expect(ids(cat)).toEqual(["n1", "b1", "a6"]);
	});

	it("そのシリーズ・科目にサンプルがなければ、次の段階に下りる", () => {
		expect(referenceSamples(rows, key("A", "Z"), 2).level).toBe("course");
		expect(referenceSamples(rows, key("Z", "Z"), 2).level).toBe("category");
		expect(ids(referenceSamples(rows, key("Z", "Z"), 2))).toEqual(["n1", "b1"]);
	});

	it("サンプルがなければ level は null", () => {
		expect(referenceSamples(rows, key(null, null, "other"), 3)).toEqual({ level: null, items: [] });
		expect(referenceSamples([], NONE, 3)).toEqual({ level: null, items: [] });
	});

	it("limit より少なければある分だけ。入力の並びに依らず、不正なサンプルは使わない。サンプルの中身はそのまま返す", () => {
		const bad = row("bad", 99, { courseId: "A", seriesId: "S", actualMin: 0 });
		const got = referenceSamples([...rows].reverse().concat(bad), key("A", "S"), 10);
		expect(ids(got)).toEqual(["a6", "a5", "a2", "a1"]);
		expect(got.items[0]).toBe(rows[5]);
		expect(referenceSamples(rows, key(null, null, "quiz"), 0).items).toEqual([]);
	});
});
