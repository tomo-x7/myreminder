// 見積もりの学習(仕様: ai-docs/specs/planner.md §1)
// y = ln(実績/見積もり) を正規分布とみなし、正規–逆χ² の共役更新で全体と区分ごとの事後分布を求める
import type { Category, Minutes, Ms } from "./types";

export type Sample = {
	category: Category;
	estimateMin: Minutes; // 登録時の見積もり(> 0)
	actualMin: Minutes; // 確定済みの作業記録の合計(> 0)
	completedAt: Ms;
};

export type Prior = { mu0: number; sigma0: number; kappa0: number; nu0: number };

export const DEFAULT_PRIOR: Prior = { mu0: Math.log(1.3), sigma0: 0.5, kappa0: 3, nu0: 3 };

export type EstimateOptions = {
	/** 新しい順に数えて、この件数で重みが半分になる */
	halfLife: number;
	/** 区分ごとの推定を全体に寄せる強さ(区分の事前分布の κ0 = ν0) */
	shrinkK: number;
	/** 比率 actual/estimate をこの範囲に切る(止め忘れ対策) */
	clip: [number, number];
};

export const DEFAULT_ESTIMATE_OPTIONS: EstimateOptions = { halfLife: 15, shrinkK: 5, clip: [0.2, 5] };

export type Size = "s" | "m" | "l";

/** 事後分布(y = ln 比率 の (μ, σ², κ, ν) と、更新に使った重みの合計) */
type Posterior = { mu: number; sigma: number; kappa: number; nu: number; weight: number };

export type EstimateModel = {
	global: Posterior;
	/** サンプルのある区分だけ。キーは `${category}:${size}` */
	buckets: ReadonlyMap<string, Posterior>;
};

/** 見積もりの長さで決めるサイズ: 60分未満 s / 60〜180分未満 m / 180分以上 l */
export function sizeOf(estimateMin: Minutes): Size {
	if (estimateMin < 60) return "s";
	if (estimateMin < 180) return "m";
	return "l";
}

function bucketKey(category: Category, size: Size): string {
	return `${category}:${size}`;
}

/**
 * 重みつきの正規–逆χ² 更新(BDA3 §3.3 の n を Σw に置き換えたもの)
 * @param n 重みの合計 Σw
 * @param ybar 重みつき平均
 * @param ss 重みつき平方和 Σw(y − ȳ)²
 */
function update(prior: Prior, n: number, ybar: number, ss: number): Posterior {
	const kappa = prior.kappa0 + n;
	const nu = prior.nu0 + n;
	const mu = (prior.kappa0 * prior.mu0 + n * ybar) / kappa;
	// νn·σn² = ν0·σ0² + S + κ0·n/κn·(ȳ − μ0)²
	const nuSigma2 = prior.nu0 * prior.sigma0 ** 2 + ss + ((prior.kappa0 * n) / kappa) * (ybar - prior.mu0) ** 2;
	return { mu, sigma: Math.sqrt(nuSigma2 / nu), kappa, nu, weight: n };
}

type Weighted = { y: number; w: number };

function summarize(items: Weighted[]): { n: number; ybar: number; ss: number } {
	let n = 0;
	let sy = 0;
	for (const { y, w } of items) {
		n += w;
		sy += w * y;
	}
	if (n === 0) return { n: 0, ybar: 0, ss: 0 };
	const ybar = sy / n;
	let ss = 0;
	for (const { y, w } of items) ss += w * (y - ybar) ** 2;
	return { n, ybar, ss };
}

export function fitEstimateModel(
	samples: Sample[],
	prior: Prior = DEFAULT_PRIOR,
	opts: Partial<EstimateOptions> = {},
): EstimateModel {
	const { halfLife, shrinkK, clip } = { ...DEFAULT_ESTIMATE_OPTIONS, ...opts };
	const [lo, hi] = clip;

	// 不正な値(0以下・非有限)のサンプルは捨てる。新しい順に並べる(同時刻は入力順)
	const valid = samples
		.filter(
			(s) =>
				Number.isFinite(s.estimateMin) && Number.isFinite(s.actualMin) && s.estimateMin > 0 && s.actualMin > 0,
		)
		.sort((a, b) => b.completedAt - a.completedAt);

	const all: Weighted[] = [];
	const byBucket = new Map<string, Weighted[]>();
	valid.forEach((s, i) => {
		const ratio = Math.min(hi, Math.max(lo, s.actualMin / s.estimateMin));
		const item = { y: Math.log(ratio), w: 0.5 ** (i / halfLife) };
		all.push(item);
		const key = bucketKey(s.category, sizeOf(s.estimateMin));
		const list = byBucket.get(key);
		if (list) list.push(item);
		else byBucket.set(key, [item]);
	});

	const g = summarize(all);
	const global = update(prior, g.n, g.ybar, g.ss);

	// 区分の事前分布は全体の事後分布(μn, σn)。κ0 = ν0 = shrinkK
	const bucketPrior: Prior = { mu0: global.mu, sigma0: global.sigma, kappa0: shrinkK, nu0: shrinkK };
	const buckets = new Map<string, Posterior>();
	for (const [key, items] of byBucket) {
		const b = summarize(items);
		buckets.set(key, update(bucketPrior, b.n, b.ybar, b.ss));
	}
	return { global, buckets };
}

/** サンプルのない区分は全体の事後分布をそのまま使う */
function posteriorFor(model: EstimateModel, category: Category, estimateMin: Minutes): Posterior {
	return model.buckets.get(bucketKey(category, sizeOf(estimateMin))) ?? model.global;
}

/** 予測分布(Student-t)の尺度 σn·√(1 + 1/κn) */
function predictiveScale(p: Posterior): number {
	return p.sigma * Math.sqrt(1 + 1 / p.kappa);
}

/** 計画に使う倍率(P80 なら q = 0.8)。下限は 1.0 */
export function planningMultiplier(model: EstimateModel, category: Category, estimateMin: Minutes, q = 0.8): number {
	const p = posteriorFor(model, category, estimateMin);
	const logRatio = p.mu + tQuantile(q, p.nu) * predictiveScale(p);
	return Math.max(1, Math.exp(logRatio));
}

/** 区分の不確かさ(予測分布の尺度。y = ln 比率 の単位) */
export function uncertainty(model: EstimateModel, category: Category, estimateMin: Minutes): number {
	return predictiveScale(posteriorFor(model, category, estimateMin));
}

// ---- Student-t の分位点 ----
// t 分布の裾確率 P(|T| > t) = I_x(ν/2, 1/2)、x = ν/(ν + t²) (正則化不完全ベータ関数)を二分法で逆に解く。
// 自由度は非整数でもよい。

/** ln Γ(x)(Lanczos 近似、g = 7) */
function lnGamma(x: number): number {
	const c = [
		0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
		12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
	];
	if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
	const z = x - 1;
	let s = c[0] as number;
	for (let i = 1; i < 9; i++) s += (c[i] as number) / (z + i);
	const t = z + 7.5;
	return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(s);
}

/** 不完全ベータ関数の連分数(修正 Lentz 法) */
function betaContinuedFraction(a: number, b: number, x: number): number {
	const tiny = 1e-300;
	let c = 1;
	let d = 1 - ((a + b) * x) / (a + 1);
	if (Math.abs(d) < tiny) d = tiny;
	d = 1 / d;
	let h = d;
	for (let m = 1; m <= 500; m++) {
		const m2 = 2 * m;
		let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < tiny) d = tiny;
		c = 1 + aa / c;
		if (Math.abs(c) < tiny) c = tiny;
		d = 1 / d;
		h *= d * c;
		aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
		d = 1 + aa * d;
		if (Math.abs(d) < tiny) d = tiny;
		c = 1 + aa / c;
		if (Math.abs(c) < tiny) c = tiny;
		d = 1 / d;
		const delta = d * c;
		h *= delta;
		if (Math.abs(delta - 1) < 1e-15) break;
	}
	return h;
}

/** 正則化不完全ベータ関数 I_x(a, b) */
function regularizedBeta(a: number, b: number, x: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	const lnFront = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
	const front = Math.exp(lnFront);
	// 収束の速い側の連分数を使う
	if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
	return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** 片側の裾確率 P(T > t)(t >= 0, 自由度 nu) */
function tUpperTail(t: number, nu: number): number {
	return 0.5 * regularizedBeta(nu / 2, 0.5, nu / (nu + t * t));
}

/** Student-t 分布の分位点(下側確率 q、自由度 nu > 0) */
export function tQuantile(q: number, nu: number): number {
	if (!(q >= 0 && q <= 1) || !(nu > 0)) return Number.NaN;
	if (q === 0) return Number.NEGATIVE_INFINITY;
	if (q === 1) return Number.POSITIVE_INFINITY;
	if (q === 0.5) return 0;
	if (q < 0.5) return -tQuantile(1 - q, nu);
	const tail = 1 - q;
	let lo = 0;
	let hi = 1;
	while (tUpperTail(hi, nu) > tail && hi < 1e12) {
		lo = hi;
		hi *= 2;
	}
	for (let i = 0; i < 100 && hi - lo > 1e-12 * Math.max(1, hi); i++) {
		const mid = (lo + hi) / 2;
		if (tUpperTail(mid, nu) > tail) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}
