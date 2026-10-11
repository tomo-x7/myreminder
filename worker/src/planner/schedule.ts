// スケジューラ(需要上限テスト・ALAP/EDL・Moore–Hodgson)。仕様: ai-docs/specs/planner.md §3
import { type Capacity, type CapacityDay, capacityUntil } from "./capacity";
import { HOUR, type Interval, MINUTE, type Minutes, type Ms, type Risk } from "./types";

export type PlanTask = {
	id: string;
	dueAt: Ms;
	releaseAt?: Ms; // これより前は着手できない
	remainingP80: Minutes; // 0 のタスクは呼び出し側で除く
	minBlock: Minutes; // 既定 30
	plannedStartAt?: Ms; // 本人が決めた着手時刻(実装意図)
	uncertain?: boolean; // 余裕リストの理由付け用
};

export type PlanInput = {
	now: Ms;
	tasks: PlanTask[];
	capacity: Capacity;
	marginRatio: number; // おすすめ着手時刻のマージン。既定 0.5
};

export type TaskPlan = {
	id: string;
	slackUsual: Minutes;
	slackHard: Minutes;
	latestStartUsual: Ms | null;
	latestStartHard: Ms | null;
	recommendedStart: Ms | null;
	blocks: Interval[]; // 普段のモードで置けたらその配置、置けなければ本気のモードの配置(それも置けなければ空)
	needsFullEffort: boolean;
	placementFailed: boolean;
	risk: Risk;
};

export type PlanOutput = {
	tasks: TaskPlan[]; // dueAt 昇順、同じ締切は id 昇順
	deadlines: { dueAt: Ms; slackUsual: Minutes; slackHard: Minutes }[];
	bottleneck: { dueAt: Ms; slackUsual: Minutes } | null;
	overdue: string[];
	dropCandidates: string[];
};

/** 浮動小数の誤差で slack が -1e-14 などになるのを避ける */
const snap = (x: number): number => Math.round(x * 1e6) / 1e6;

const cmpTask = (a: PlanTask, b: PlanTask): number => a.dueAt - b.dueAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ---- 配置(ALAP / EDL) ----

type Layout = {
	avail: Interval[]; // まだ誰も使っていない時間(start 昇順)
	days: CapacityDay[];
	dayRem: Float64Array | null; // 活動日ごとの残りキャパ(ms)。本気のモードでは null
};

/** start <= t を満たす最後の活動日の添字。なければ -1 */
function dayIndexAt(days: CapacityDay[], t: Ms): number {
	let lo = 0;
	let hi = days.length - 1;
	let ans = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (days[mid].start <= t) {
			ans = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return ans;
}

/** start >= t を満たす最初の区間の添字 */
function firstStartAtOrAfter(avail: Interval[], t: Ms): number {
	let lo = 0;
	let hi = avail.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (avail[mid].start >= t) hi = mid;
		else lo = mid + 1;
	}
	return lo;
}

/**
 * end から [lower, end) の範囲で、後ろ向きに needMs ぶんの時間を詰める。
 * - 長さが min(minBlockMs, 残り) 未満の断片は使わない
 * - dayRem があれば、活動日ごとの残りキャパを超えて取らない
 * - commit が真のときだけ、avail と dayRem を更新する(偽のときは dayRem を呼び出し側の作業用コピーにする)
 * 返す blocks は時刻の昇順で、隣り合うものはまとめてある。
 */
function takeBackward(
	lay: Layout,
	end: Ms,
	lower: Ms,
	needMs: number,
	minBlockMs: number,
	dayRem: Float64Array | null,
	commit: boolean,
): { blocks: Interval[]; leftMs: number } {
	const { avail, days } = lay;
	const desc: Interval[] = [];
	let left = needMs;
	for (let i = firstStartAtOrAfter(avail, end) - 1; i >= 0 && left > 0; i--) {
		const iv = avail[i];
		if (iv.end <= lower) break;
		const ps = Math.max(iv.start, lower);
		let pe = Math.min(iv.end, end);
		const taken: Interval[] = [];
		// 区間が複数の活動日にまたがる場合(睡眠なし)は日ごとに分けて、後ろから見る
		while (pe > ps && left > 0) {
			let a = ps;
			let rem = Number.POSITIVE_INFINITY;
			let j = -1;
			if (dayRem) {
				j = dayIndexAt(days, pe - 1);
				if (j >= 0) {
					a = Math.max(ps, days[j].start);
					rem = dayRem[j];
				} else {
					rem = 0;
				}
			}
			const usable = Math.min(pe - a, rem);
			if (usable > 0 && usable >= Math.min(minBlockMs, left)) {
				const take = Math.min(usable, left);
				const blk = { start: pe - take, end: pe };
				desc.push(blk);
				taken.push(blk);
				left -= take;
				if (dayRem && j >= 0) dayRem[j] -= take;
			}
			pe = a;
		}
		if (commit && taken.length > 0) {
			// 使った分を avail から抜く(締切が区間の途中にあると2つに割れる)
			const rest: Interval[] = [];
			let cursor = iv.start;
			for (let k = taken.length - 1; k >= 0; k--) {
				if (taken[k].start > cursor) rest.push({ start: cursor, end: taken[k].start });
				cursor = taken[k].end;
			}
			if (iv.end > cursor) rest.push({ start: cursor, end: iv.end });
			avail.splice(i, 1, ...rest);
		}
	}
	// desc は後ろから前の順。昇順に直して、接しているものをまとめる
	const blocks: Interval[] = [];
	for (let k = desc.length - 1; k >= 0; k--) {
		const last = blocks[blocks.length - 1];
		if (last && last.end === desc[k].start) last.end = desc[k].end;
		else blocks.push({ start: desc[k].start, end: desc[k].end });
	}
	return { blocks, leftMs: left };
}

type Placement = { ok: boolean; blocks: Interval[]; latestStart: Ms | null };

/** 締切が遅い順にタスクを後ろ向きに置いていく。asc は (dueAt, id) 昇順のタスク */
function placeAll(
	asc: PlanTask[],
	cap: Capacity,
	mode: "usual" | "hard",
	now: Ms,
): { result: Placement[]; lay: Layout } {
	const lay: Layout = {
		avail: cap.free.map((iv) => ({ start: iv.start, end: iv.end })),
		days: cap.days,
		dayRem: mode === "usual" ? Float64Array.from(cap.days, (d) => Math.floor(d.usualCap * MINUTE)) : null,
	};
	const result: Placement[] = new Array(asc.length);
	for (let k = asc.length - 1; k >= 0; k--) {
		const t = asc[k];
		const need = Math.round(t.remainingP80 * MINUTE);
		if (need <= 0) {
			result[k] = { ok: true, blocks: [], latestStart: t.dueAt };
			continue;
		}
		const lower = Math.max(now, t.releaseAt ?? Number.NEGATIVE_INFINITY);
		const { blocks, leftMs } = takeBackward(
			lay,
			t.dueAt,
			lower,
			need,
			Math.round(t.minBlock * MINUTE),
			lay.dayRem,
			true,
		);
		const ok = leftMs <= 0;
		result[k] = { ok, blocks, latestStart: ok && blocks.length > 0 ? blocks[0].start : null };
	}
	return { result, lay };
}

// ---- 本体 ----

export function plan(input: PlanInput): PlanOutput {
	const { now, capacity: cap, marginRatio } = input;

	// 1. 期限切れを外す
	const overdue: string[] = [];
	const live: PlanTask[] = [];
	for (const t of input.tasks) {
		if (t.dueAt <= now) overdue.push(t.id);
		else live.push(t);
	}
	overdue.sort();
	live.sort(cmpTask);

	// 2. 締切ごとの余裕(需要上限テスト)。同じ締切は1つにまとめる
	const dues: Ms[] = [];
	const groupOf: number[] = new Array(live.length);
	const demandUpTo: Minutes[] = []; // d_i 以前のタスクの remainingP80 の合計
	let acc = 0;
	for (let k = 0; k < live.length; k++) {
		if (dues.length === 0 || dues[dues.length - 1] !== live[k].dueAt) dues.push(live[k].dueAt);
		acc += live[k].remainingP80;
		demandUpTo[dues.length - 1] = acc;
		groupOf[k] = dues.length - 1;
	}
	const capU = dues.map((d) => capacityUntil(cap, d, "usual"));
	const capH = dues.map((d) => capacityUntil(cap, d, "hard"));
	const sU = dues.map((_, i) => snap(capU[i] - demandUpTo[i]));
	const sH = dues.map((_, i) => snap(capH[i] - demandUpTo[i]));
	// 3. タスクごとの余裕 = 自分以降の締切の余裕の最小(末尾からの累積最小)
	const minU: number[] = new Array(dues.length);
	const minH: number[] = new Array(dues.length);
	for (let i = dues.length - 1; i >= 0; i--) {
		minU[i] = i === dues.length - 1 ? sU[i] : Math.min(sU[i], minU[i + 1]);
		minH[i] = i === dues.length - 1 ? sH[i] : Math.min(sH[i], minH[i + 1]);
	}

	// 4. 山場(同点は締切が早い方)
	let bottleneck: PlanOutput["bottleneck"] = null;
	for (let i = 0; i < dues.length; i++) {
		if (bottleneck === null || sU[i] < bottleneck.slackUsual) bottleneck = { dueAt: dues[i], slackUsual: sU[i] };
	}

	// 5. 配置
	const usual = placeAll(live, cap, "usual", now);
	const hard = placeAll(live, cap, "hard", now);

	// 7. おすすめ着手時刻: 配置後に残った普段のキャパを使って、latestStart から後ろへマージンぶん遡る
	const recommended = (k: number): Ms | null => {
		const ls = usual.result[k].latestStart;
		if (ls === null) return null;
		const t = live[k];
		const marginMs = Math.round(Math.max(30, marginRatio * t.remainingP80) * MINUTE);
		const scratch = usual.lay.dayRem ? Float64Array.from(usual.lay.dayRem) : null;
		// 公開日時より前には着手できないので、遡る下限は max(now, releaseAt)
		const lower = Math.max(now, t.releaseAt ?? Number.NEGATIVE_INFINITY);
		const { blocks, leftMs } = takeBackward(usual.lay, ls, lower, marginMs, 0, scratch, false);
		return leftMs > 0 || blocks.length === 0 ? lower : blocks[0].start;
	};

	// 8. リスク
	const tasks: TaskPlan[] = live.map((t, k) => {
		const g = groupOf[k];
		const slackUsual = minU[g];
		const slackHard = minH[g];
		const pu = usual.result[k];
		const ph = hard.result[k];
		const latestStartUsual = pu.latestStart;
		const latestStartHard = ph.latestStart;
		let risk: Risk;
		if (slackHard < 0 || latestStartHard === null || t.dueAt - now <= 3 * HOUR) risk = "critical";
		else if (slackUsual < 0 || latestStartUsual === null || latestStartUsual - now <= 24 * HOUR) risk = "danger";
		else if (slackUsual < 2 * t.remainingP80) risk = "watch";
		else risk = "relaxed";
		const usualOk = slackUsual >= 0 && pu.ok;
		const hardOk = slackHard >= 0 && ph.ok;
		return {
			id: t.id,
			slackUsual,
			slackHard,
			latestStartUsual,
			latestStartHard,
			recommendedStart: recommended(k),
			blocks: pu.ok ? pu.blocks : ph.ok ? ph.blocks : [],
			needsFullEffort: !usualOk && hardOk,
			// 需要上限テストは通るのに置ききれなかった(minBlock・releaseAt・日ごとの上限が原因)
			placementFailed: (slackUsual >= 0 && !pu.ok) || (slackHard >= 0 && !ph.ok),
			risk,
		};
	});

	return {
		tasks,
		deadlines: dues.map((dueAt, i) => ({ dueAt, slackUsual: sU[i], slackHard: sH[i] })),
		bottleneck,
		overdue,
		dropCandidates: sH.some((s) => s < 0) ? mooreHodgson(live, groupOf, capH) : [],
	};
}

/** 本気のキャパで、締切順に足して超えたら一番大きいタスクを外す。同点は締切が遅い方 → id 昇順 */
function mooreHodgson(live: PlanTask[], groupOf: number[], capH: Minutes[]): string[] {
	const kept: PlanTask[] = [];
	const dropped: string[] = [];
	let sum = 0;
	for (let k = 0; k < live.length; k++) {
		kept.push(live[k]);
		sum += live[k].remainingP80;
		while (kept.length > 0 && snap(sum - capH[groupOf[k]]) > 0) {
			let worst = 0;
			for (let m = 1; m < kept.length; m++) {
				const a = kept[m];
				const b = kept[worst];
				if (
					a.remainingP80 > b.remainingP80 ||
					(a.remainingP80 === b.remainingP80 && (a.dueAt > b.dueAt || (a.dueAt === b.dueAt && a.id < b.id)))
				)
					worst = m;
			}
			sum -= kept[worst].remainingP80;
			dropped.push(kept[worst].id);
			kept.splice(worst, 1);
		}
	}
	return dropped;
}
