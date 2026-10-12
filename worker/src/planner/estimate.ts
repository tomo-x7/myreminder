// 見積もりの学習(仕様: ai-docs/specs/planner.md §1)
// 実績が見積もりにどれだけ比例するかを傾き b で表し、基準の見積もり c のときの ln 比率 z を、
// 全体 → 種類 → 科目 → 繰り返しの順に、正規–逆χ² の共役更新で縮小推定する
import type { Category, Minutes, Ms } from "./types";

export type Sample = {
	category: Category;
	courseId: string | null;
	seriesId: string | null;
	estimateMin: Minutes; // 登録時の見積もり(> 0)
	actualMin: Minutes; // 確定済みの作業記録の合計(> 0)
	completedAt: Ms;
};

/** 予測したいタスクの属性 */
export type EstimateKey = { category: Category; courseId: string | null; seriesId: string | null };

export type Prior = { mu0: number; sigma0: number; kappa0: number; nu0: number };

export const DEFAULT_PRIOR: Prior = { mu0: Math.log(1.3), sigma0: 0.5, kappa0: 3, nu0: 3 };

export type EstimateOptions = {
	/** 新しい順に数えて、この件数で重みが半分になる */
	halfLife: number;
	/** 下の段階の推定を上の段階に寄せる強さ(下の段階の事前分布の κ0 = ν0) */
	shrinkK: number;
	/** 比率 actual/estimate をこの範囲に切る(止め忘れ対策)。倍率もこの範囲に収める */
	clip: [number, number];
	/** 傾きを 1 に寄せる強さ。既定は「見積もりが2倍違うサンプル2件」ぶん */
	slopePrior: number;
};

export const DEFAULT_ESTIMATE_OPTIONS: EstimateOptions = {
	halfLife: 15,
	shrinkK: 5,
	clip: [0.2, 5],
	slopePrior: 2 * Math.LN2 ** 2,
};

/** 事後分布(z = 補正後の ln 比率 の (μ, σ, κ, ν)) */
type Posterior = { mu: number; sigma: number; kappa: number; nu: number };

/** 段階ごとのサンプルの要約。n = Σw、mean = z の重みつき平均、ss = 重みつき平方和、count = 件数 */
type Summary = { n: number; mean: number; ss: number; count: number };

export type EstimateModel = {
	prior: Prior;
	shrinkK: number;
	clip: [number, number];
	/** 傾き b(0〜1)。1 = 実績は見積もりに比例、0 = 見積もりによらない */
	slope: number;
	/** 基準の見積もり c(ln 分)。全サンプルの ln 見積もりの重みつき平均 */
	baseLogEstimate: number;
	global: Summary;
	/** 以下はサンプルのあるキーだけ。科目は `courseKeyOf`、繰り返しは seriesId */
	categories: ReadonlyMap<Category, Summary>;
	courses: ReadonlyMap<string, Summary>;
	series: ReadonlyMap<string, Summary>;
};

/** 種類 × 科目。科目なしは種類ごとに1つのまとまりとする */
function courseKeyOf(category: Category, courseId: string | null): string {
	return courseId === null ? category : `${category}\u0000${courseId}`;
}

/**
 * 重みつきの正規–逆χ² 更新(BDA3 §3.3 の n を Σw に置き換えたもの)
 * @param n 重みの合計 Σw
 * @param ybar 重みつき平均
 * @param ss 重みつき平方和 Σw(y − ȳ)²
 */
function update(prior: Prior, n: number, ybar: number, ss: number): Posterior {
	// n = 0 で更新すると自由度と尺度が変わってしまうので、事前分布をそのまま返す
	if (n === 0) return { mu: prior.mu0, sigma: prior.sigma0, kappa: prior.kappa0, nu: prior.nu0 };
	const kappa = prior.kappa0 + n;
	const nu = prior.nu0 + n;
	const mu = (prior.kappa0 * prior.mu0 + n * ybar) / kappa;
	// νn·σn² = ν0·σ0² + S + κ0·n/κn·(ȳ − μ0)²
	const nuSigma2 = prior.nu0 * prior.sigma0 ** 2 + ss + ((prior.kappa0 * n) / kappa) * (ybar - prior.mu0) ** 2;
	return { mu, sigma: Math.sqrt(nuSigma2 / nu), kappa, nu };
}

type Weighted = { y: number; w: number };

function summarize(items: Weighted[]): Summary {
	let n = 0;
	let sy = 0;
	for (const { y, w } of items) {
		n += w;
		sy += w * y;
	}
	if (n === 0) return { n: 0, mean: 0, ss: 0, count: items.length };
	const mean = sy / n;
	let ss = 0;
	for (const { y, w } of items) ss += w * (y - mean) ** 2;
	return { n, mean, ss, count: items.length };
}

function isValid(s: Sample): boolean {
	return (
		Number.isFinite(s.estimateMin) &&
		Number.isFinite(s.actualMin) &&
		Number.isFinite(s.completedAt) &&
		s.estimateMin > 0 &&
		s.actualMin > 0
	);
}

const compare = (a: string | number, b: string | number): number => (a < b ? -1 : a > b ? 1 : 0);
const compareNullable = (a: string | null, b: string | null): number =>
	a === b ? 0 : a === null ? -1 : b === null ? 1 : compare(a, b);

/**
 * 新しい順。同時刻のサンプルも入力の並びに依らず同じ順になるよう、残りの項目で決める
 * (順位が重みになるので、並びが変わると結果が変わってしまう)
 */
function newestFirst(a: Sample, b: Sample): number {
	return (
		compare(b.completedAt, a.completedAt) ||
		compare(a.category, b.category) ||
		compareNullable(a.courseId, b.courseId) ||
		compareNullable(a.seriesId, b.seriesId) ||
		compare(a.estimateMin, b.estimateMin) ||
		compare(a.actualMin, b.actualMin)
	);
}

type Point = { courseKey: string; x: number; r: number; w: number };

/**
 * 傾き b。course のキーでまとめた重みつきの群内回帰(群ごとの平均からの差で最小二乗)を、
 * 仮想的な「傾き 1・重み slopePrior」の観測で 1 に寄せ、[0, 1] に収める。
 * まとまりの中で見積もりが全部同じなら、そのまとまりは何も寄与しない
 */
function fitSlope(points: Point[], slopePrior: number): number {
	const groups = new Map<string, Point[]>();
	for (const p of points) {
		const list = groups.get(p.courseKey);
		if (list) list.push(p);
		else groups.set(p.courseKey, [p]);
	}
	let sxy = 0;
	let sxx = 0;
	for (const list of groups.values()) {
		let n = 0;
		let sx = 0;
		let sy = 0;
		for (const { x, r, w } of list) {
			n += w;
			sx += w * x;
			sy += w * (x + r);
		}
		const xbar = sx / n;
		const ybar = sy / n;
		for (const { x, r, w } of list) {
			const dx = x - xbar;
			sxy += w * dx * (x + r - ybar);
			sxx += w * dx * dx;
		}
	}
	const denominator = sxx + slopePrior;
	if (!(denominator > 0)) return 1;
	return Math.min(1, Math.max(0, (sxy + slopePrior) / denominator));
}

function pushTo<K>(map: Map<K, Weighted[]>, key: K, item: Weighted): void {
	const list = map.get(key);
	if (list) list.push(item);
	else map.set(key, [item]);
}

export function fitEstimateModel(
	samples: Sample[],
	prior: Prior = DEFAULT_PRIOR,
	opts: Partial<EstimateOptions> = {},
): EstimateModel {
	const { halfLife, shrinkK, clip, slopePrior } = { ...DEFAULT_ESTIMATE_OPTIONS, ...opts };
	const [lo, hi] = clip;

	// 不正な値(0以下・非有限)のサンプルは捨てる。重みはすべての段階で共通(新しい順の順位で決まる)
	const valid = samples.filter(isValid).sort(newestFirst);
	const points = valid.map((s, i) => ({
		courseKey: courseKeyOf(s.category, s.courseId),
		x: Math.log(s.estimateMin),
		r: Math.log(Math.min(hi, Math.max(lo, s.actualMin / s.estimateMin))),
		w: 0.5 ** (i / halfLife),
	}));

	const slope = fitSlope(points, slopePrior);

	let wSum = 0;
	let wxSum = 0;
	for (const { x, w } of points) {
		wSum += w;
		wxSum += w * x;
	}
	const baseLogEstimate = wSum > 0 ? wxSum / wSum : Math.log(60);

	// 基準の見積もり c のときの ln 比率に直した値 z を、段階ごとに集める
	const all: Weighted[] = [];
	const byCategory = new Map<Category, Weighted[]>();
	const byCourse = new Map<string, Weighted[]>();
	const bySeries = new Map<string, Weighted[]>();
	valid.forEach((s, i) => {
		const p = points[i] as Point;
		const item = { y: p.r - (slope - 1) * (p.x - baseLogEstimate), w: p.w };
		all.push(item);
		pushTo(byCategory, s.category, item);
		if (s.courseId !== null) pushTo(byCourse, p.courseKey, item);
		if (s.seriesId !== null) pushTo(bySeries, s.seriesId, item);
	});
	const summaries = <K>(m: Map<K, Weighted[]>): Map<K, Summary> =>
		new Map([...m].map(([k, items]) => [k, summarize(items)]));

	return {
		prior,
		shrinkK,
		clip: [lo, hi],
		slope,
		baseLogEstimate,
		global: summarize(all),
		categories: summaries(byCategory),
		courses: summaries(byCourse),
		series: summaries(bySeries),
	};
}

type Basis = { level: "prior" | "global" | "category" | "course" | "series"; count: number };

/**
 * key の段階を上から順にたどって、一番下の段階の事後分布を求める。
 * サンプルのない段階は飛ばす(上の段階の事後分布をそのまま使う)
 */
function posteriorFor(model: EstimateModel, key: EstimateKey): { posterior: Posterior; basis: Basis } {
	const g = model.global;
	let posterior = update(model.prior, g.n, g.mean, g.ss);
	let basis: Basis = g.count > 0 ? { level: "global", count: g.count } : { level: "prior", count: 0 };
	const descend = (s: Summary | undefined, level: "category" | "course" | "series") => {
		if (!s) return;
		const k = model.shrinkK;
		posterior = update({ mu0: posterior.mu, sigma0: posterior.sigma, kappa0: k, nu0: k }, s.n, s.mean, s.ss);
		basis = { level, count: s.count };
	};
	descend(model.categories.get(key.category), "category");
	if (key.courseId !== null) descend(model.courses.get(courseKeyOf(key.category, key.courseId)), "course");
	if (key.seriesId !== null) descend(model.series.get(key.seriesId), "series");
	return { posterior, basis };
}

/** 予測分布(Student-t)の尺度 σn·√(1 + 1/κn) */
function predictiveScale(p: Posterior): number {
	return p.sigma * Math.sqrt(1 + 1 / p.kappa);
}

/** 計画に使う倍率(P80 なら q = 0.8)。clip の範囲に収める(下限 1.0 はない) */
export function planningMultiplier(model: EstimateModel, key: EstimateKey, estimateMin: Minutes, q = 0.8): number {
	const { posterior: p } = posteriorFor(model, key);
	// 基準の見積もり c から離れるぶんは、傾き b で補正する
	const dx = estimateMin > 0 ? Math.log(estimateMin) - model.baseLogEstimate : 0;
	const logRatio = p.mu + tQuantile(q, p.nu) * predictiveScale(p) + (model.slope - 1) * dx;
	const [lo, hi] = model.clip;
	return Math.min(hi, Math.max(lo, Math.exp(logRatio)));
}

/** 一番下の段階の予測分布の尺度(ln 比率の単位) */
export function uncertainty(model: EstimateModel, key: EstimateKey): number {
	return predictiveScale(posteriorFor(model, key).posterior);
}

/** 予測に使った一番下の段階と、その段階のサンプル数。サンプルが0件なら { level: "prior", count: 0 } */
export function estimateBasis(model: EstimateModel, key: EstimateKey): Basis {
	return posteriorFor(model, key).basis;
}

/**
 * 入力欄に出す過去の実績。series → course → category の順に探し、サンプルのある一番下の段階の新しい順 limit 件。
 * 学習と同じく、不正なサンプルは使わない
 */
export function referenceSamples<T extends Sample>(
	samples: T[],
	key: EstimateKey,
	limit: number,
): { level: "series" | "course" | "category" | null; items: T[] } {
	const sorted = samples.filter(isValid).sort(newestFirst);
	const levels = [
		{
			level: "series",
			match: (s: T) => key.seriesId !== null && s.seriesId === key.seriesId,
		},
		{
			level: "course",
			match: (s: T) => key.courseId !== null && s.category === key.category && s.courseId === key.courseId,
		},
		{ level: "category", match: (s: T) => s.category === key.category },
	] as const;
	for (const { level, match } of levels) {
		const items = sorted.filter(match);
		if (items.length > 0) return { level, items: items.slice(0, Math.max(0, limit)) };
	}
	return { level: null, items: [] };
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
