import { describe, expect, it } from "vitest";
import {
	DEFAULT_PRIOR,
	fitEstimateModel,
	planningMultiplier,
	type Sample,
	sizeOf,
	tQuantile,
	uncertainty,
} from "./estimate";
import type { Category } from "./types";

const DAY_MS = 86_400_000;

/** completedAt は i が大きいほど新しい */
function sample(i: number, ratio: number, category: Category = "report", estimateMin = 120): Sample {
	return { category, estimateMin, actualMin: estimateMin * ratio, completedAt: i * DAY_MS };
}

function many(n: number, ratio: number, category: Category = "report", estimateMin = 120, offset = 0): Sample[] {
	return Array.from({ length: n }, (_, i) => sample(offset + i, ratio, category, estimateMin));
}

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

describe("sizeOf", () => {
	it("60 未満 s / 60〜180 未満 m / 180 以上 l", () => {
		expect(sizeOf(59)).toBe("s");
		expect(sizeOf(60)).toBe("m");
		expect(sizeOf(179)).toBe("m");
		expect(sizeOf(180)).toBe("l");
	});
});

describe("fitEstimateModel", () => {
	it("サンプルが0件なら事前分布だけで決まる", () => {
		const model = fitEstimateModel([]);
		const expected = 1.3 * Math.exp(0.9785 * 0.5 * Math.sqrt(4 / 3));
		const got = planningMultiplier(model, "report", 120);
		expect(Math.abs(Math.log(got / expected))).toBeLessThan(0.01);
		expect(uncertainty(model, "report", 120)).toBeCloseTo(0.5 * Math.sqrt(4 / 3), 10);
		expect(model.global.mu).toBeCloseTo(DEFAULT_PRIOR.mu0, 10);
	});

	it("比率がすべて 1.0 のサンプルが多数なら、事前分布より倍率が下がり、下限 1.0 を下回らない", () => {
		const prior = planningMultiplier(fitEstimateModel([]), "report", 120);
		const m100 = planningMultiplier(fitEstimateModel(many(100, 1)), "report", 120);
		const m10 = planningMultiplier(fitEstimateModel(many(10, 1)), "report", 120);
		expect(m100).toBeLessThan(m10);
		expect(m10).toBeLessThan(prior);
		expect(m100).toBeGreaterThanOrEqual(1);
		expect(m100).toBeLessThan(1.3);
	});

	it("実績が見積もりより小さい比率ばかりなら、倍率は 1.0 で止まる", () => {
		const model = fitEstimateModel(many(60, 0.5));
		expect(model.global.mu).toBeLessThan(0);
		expect(planningMultiplier(model, "report", 120)).toBe(1);
	});

	it("比率 20 のサンプルは 5 に切られる", () => {
		const a = fitEstimateModel(many(5, 20));
		const b = fitEstimateModel(many(5, 5));
		expect(a.global).toEqual(b.global);
		expect(planningMultiplier(a, "report", 120)).toBe(planningMultiplier(b, "report", 120));
		// 下側も 0.2 で切る
		expect(fitEstimateModel(many(5, 0.001)).global).toEqual(fitEstimateModel(many(5, 0.2)).global);
	});

	it("サンプルがない区分は全体の値になる", () => {
		const model = fitEstimateModel(many(20, 2, "report"));
		expect(planningMultiplier(model, "quiz", 30)).toBe(planningMultiplier(model, "other", 500));
		expect(uncertainty(model, "quiz", 30)).toBeCloseTo(
			model.global.sigma * Math.sqrt(1 + 1 / model.global.kappa),
			12,
		);
		// 同じ種類でもサイズが違えば、サンプルがない区分
		expect(planningMultiplier(model, "report", 30)).toBe(planningMultiplier(model, "quiz", 30));
	});

	it("新しいサンプルほど効く", () => {
		const oldTwoNewOne = [...many(10, 2, "report", 120, 0), ...many(10, 1, "report", 120, 10)];
		const oldOneNewTwo = [...many(10, 1, "report", 120, 0), ...many(10, 2, "report", 120, 10)];
		const a = fitEstimateModel(oldTwoNewOne).global.mu;
		const b = fitEstimateModel(oldOneNewTwo).global.mu;
		expect(a).toBeLessThan(b);
		// 全体の中心は ln2/2 (単純平均) より 0 寄り
		expect(a).toBeLessThan(Math.log(2) / 2);
		expect(b).toBeGreaterThan(Math.log(2) / 2);
	});

	it("入力の並びに依らない(completedAt で新旧を決める)", () => {
		const s = [...many(10, 2, "report", 120, 0), ...many(10, 1, "report", 120, 10)];
		const shuffled = [...s].reverse();
		expect(fitEstimateModel(shuffled).global).toEqual(fitEstimateModel(s).global);
	});

	it("区分のサンプルが少ないうちは全体に寄り、増えるにつれて区分の値に近づく", () => {
		const base = many(40, 1, "report");
		const mu = (n: number, shrinkK = 5) => {
			const model = fitEstimateModel([...base, ...many(n, 3, "quiz", 30, 100)], DEFAULT_PRIOR, { shrinkK });
			const b = model.buckets.get("quiz:s");
			if (!b) throw new Error("bucket missing");
			return { bucket: b.mu, global: model.global.mu };
		};
		const one = mu(1);
		expect(one.bucket).toBeGreaterThan(one.global);
		// 1件だけなら、区分の平均 ln3 よりずっと全体に近い
		expect(one.bucket - one.global).toBeLessThan((Math.log(3) - one.global) / 4);
		const many20 = mu(20);
		expect(many20.bucket - many20.global).toBeGreaterThan(one.bucket - one.global);
		// shrinkK が大きいほど全体に寄る
		expect(mu(3, 20).bucket - mu(3, 20).global).toBeLessThan(mu(3, 1).bucket - mu(3, 1).global);
	});

	it("不正なサンプル(0以下・NaN)は無視する", () => {
		const good = many(5, 1.5);
		const bad: Sample[] = [
			{ category: "report", estimateMin: 0, actualMin: 10, completedAt: 1e12 },
			{ category: "report", estimateMin: 10, actualMin: 0, completedAt: 1e12 },
			{ category: "report", estimateMin: Number.NaN, actualMin: 10, completedAt: 1e12 },
		];
		expect(fitEstimateModel([...bad, ...good]).global).toEqual(fitEstimateModel(good).global);
	});

	it("q を上げると倍率が増える。同じ入力なら結果は同じ", () => {
		const s = many(12, 1.5);
		const m = fitEstimateModel(s);
		expect(planningMultiplier(m, "report", 120, 0.9)).toBeGreaterThan(planningMultiplier(m, "report", 120, 0.8));
		expect(planningMultiplier(fitEstimateModel(s), "report", 120)).toBe(planningMultiplier(m, "report", 120));
	});
});
