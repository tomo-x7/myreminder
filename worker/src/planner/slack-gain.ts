// 余裕リストのスコア(反実仮想の再計画)。仕様: ai-docs/specs/planner.md §4
import { buildCapacity, type Capacity, type CapacityInput, capacityUntil } from "./capacity";
import { type PlanTask, plan } from "./schedule";
import { MINUTE, type Minutes, type Ms } from "./types";

export type SlackGainInput = {
	/** 現在の使える時間の入力。`now` を進めて作り直すので、構築済みの Capacity ではなく素の入力を渡す */
	capacityInput: CapacityInput;
	/** 現在の計画に載っているタスク(余裕リストの対象以外も含む) */
	tasks: PlanTask[];
	marginRatio: number;
	/** 余裕リストの対象(risk が relaxed のタスク) */
	candidateIds: string[];
	/** 次の空き時間の長さ(分) */
	spareMin: Minutes;
	/** ストレスの尺度。既定 1 */
	tau?: number;
	/** true なら近道をせず、候補ごとに計画し直す(近道との一致を確かめるテスト用) */
	exact?: boolean;
};

export type SlackGain = {
	id: string;
	/** 負なら改善 */
	infeasibleDelta: number;
	/** 正なら改善。表示に使う */
	bottleneckDeltaMin: Minutes;
	/** 負なら改善 */
	stressDelta: number;
	reason: "big_block" | "uncertain" | "before_peak" | "earliest";
};

/** 浮動小数の誤差で順位が入れ替わらないように丸める */
const snap = (x: number, scale: number): number => Math.round(x * scale) / scale;
const cmpId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const cmpTask = (a: PlanTask, b: PlanTask): number => a.dueAt - b.dueAt || cmpId(a.id, b.id);

type Evaluation = {
	/** 間に合わないタスクの数 */
	infeasible: number;
	/** 山場の余裕。タスクがなければ null */
	bottleneck: Minutes | null;
	/** 締切ごとの余裕(普段のキャパ) */
	slacks: Minutes[];
};

/**
 * 普段のキャパで、締切順に足して超えたら一番大きいタスクを外す(Moore–Hodgson)。
 * schedule.ts の dropCandidates と同じ同点処理(大きい → 締切が遅い → id が小さい)。
 * schedule.ts は本気のキャパでしか計算しないので、普段のキャパ用にここで持つ。
 */
function mooreHodgsonUsual(live: PlanTask[], cap: Capacity): { kept: PlanTask[]; dropped: number } {
	const capCache = new Map<Ms, Minutes>();
	const capAt = (d: Ms): Minutes => {
		let v = capCache.get(d);
		if (v === undefined) {
			v = capacityUntil(cap, d, "usual");
			capCache.set(d, v);
		}
		return v;
	};
	const kept: PlanTask[] = [];
	let dropped = 0;
	let sum = 0;
	for (const t of live) {
		kept.push(t);
		sum += t.remainingP80;
		while (kept.length > 0 && snap(sum - capAt(t.dueAt), 1e6) > 0) {
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
			kept.splice(worst, 1);
			dropped++;
		}
	}
	return { kept, dropped };
}

/**
 * 計画を1回評価する。
 * 間に合わないタスク = 普段のキャパで Moore–Hodgson が外すもの
 *   + 外した残りを計画したとき、minBlock・releaseAt・日ごとの上限のせいで普段のモードで置けないもの。
 * 後者を数えるのは、まとまった時間が要るタスクの効果(`big_block`)が需要上限テストだけでは見えないため。
 */
function evaluate(tasks: PlanTask[], cap: Capacity, now: Ms, marginRatio: number): Evaluation {
	const out = plan({ now, tasks, capacity: cap, marginRatio });
	const live = tasks.filter((t) => t.dueAt > now).sort(cmpTask);
	const { kept, dropped } = mooreHodgsonUsual(live, cap);
	// 外す必要がなければ、上の計画の配置結果がそのまま使える
	const placed = dropped === 0 ? out : plan({ now, tasks: kept, capacity: cap, marginRatio });
	const placementFailures = placed.tasks.filter((t) => t.latestStartUsual === null).length;
	return {
		infeasible: dropped + placementFailures,
		bottleneck: out.bottleneck ? out.bottleneck.slackUsual : null,
		slacks: out.deadlines.map((d) => d.slackUsual),
	};
}

/**
 * 配置をせずに、締切ごとの余裕(普段のキャパ)と山場だけを出す。plan() の手順2・4と同じ計算・同じ順序
 * (同じ浮動小数の結果になるように)。capU は締切までの普段のキャパ
 */
function demandBound(tasks: PlanTask[], now: Ms, capU: (d: Ms) => Minutes): Omit<Evaluation, "infeasible"> {
	const live = tasks.filter((t) => t.dueAt > now).sort(cmpTask);
	const slacks: Minutes[] = [];
	let bottleneck: Minutes | null = null;
	let acc = 0;
	for (let k = 0; k < live.length; k++) {
		acc += live[k].remainingP80;
		// 同じ締切は1つにまとめる(最後のタスクまで足してから余裕を出す)
		if (k + 1 < live.length && live[k + 1].dueAt === live[k].dueAt) continue;
		const s = snap(capU(live[k].dueAt) - acc, 1e6);
		slacks.push(s);
		if (bottleneck === null || s < bottleneck) bottleneck = s;
	}
	return { bottleneck, slacks };
}

/** ストレス Σ exp(−(s / D) / tau) */
function stressOf(slacks: Minutes[], D: Minutes, tau: number): number {
	let sum = 0;
	for (const s of slacks) sum += Math.exp(Math.min(700, -(s / D) / tau));
	return sum;
}

/** [from, to) の本気のキャパのうち、minBlock 以上の連続した空きに入っている分の割合が半分未満か */
function isBigBlockNeeded(task: PlanTask, cap: Capacity, from: Ms): boolean {
	if (task.minBlock < 60) return false;
	const minMs = task.minBlock * MINUTE;
	let total = 0;
	let big = 0;
	for (const iv of cap.free) {
		const a = Math.max(iv.start, from);
		const b = Math.min(iv.end, task.dueAt);
		if (b <= a) continue;
		total += b - a;
		if (b - a >= minMs) big += b - a;
	}
	return total > 0 && big * 2 < total;
}

export function slackGain(input: SlackGainInput): SlackGain[] {
	const { capacityInput, tasks, marginRatio, spareMin } = input;
	const tau = input.tau !== undefined && input.tau > 0 ? input.tau : 1;
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const candidates = [...new Set(input.candidateIds)]
		.map((id) => byId.get(id))
		.filter((t): t is PlanTask => t !== undefined)
		.sort(cmpTask);
	if (candidates.length === 0) return [];

	const now = capacityInput.now;
	const nextNow = now + spareMin * MINUTE;

	// 現在の計画(山場の判定用)
	const capNow = buildCapacity(capacityInput);
	const currentPeak = plan({ now, tasks, capacity: capNow, marginRatio }).bottleneck;

	// now' の使える時間。workedToday はそのまま(余裕リストでやった分は計画の外)。
	// ただし now' が次の活動日に入るなら、今日の作業分はもう関係ない
	const nextDayStarts = capNow.days.length > 0 ? capNow.days[0].end : Number.POSITIVE_INFINITY;
	const capNext = buildCapacity({
		...capacityInput,
		now: nextNow,
		workedToday: nextNow >= nextDayStarts ? 0 : capacityInput.workedToday,
	});
	const D = Math.max(
		1,
		capNext.days.length > 0 ? capNext.days.reduce((s, d) => s + d.usualCap, 0) / capNext.days.length : 0,
	);

	// 基準: 休んだ場合
	const base = evaluate(tasks, capNext, nextNow, marginRatio);
	const baseStress = stressOf(base.slacks, D, tau);

	// 近道: 休んでも間に合わないタスクがなければ、残りを減らしても間に合わないタスクは増えない
	// (需要上限テストの各締切の需要は減るだけ。配置も、減らしたぶん場所が空くだけ)。
	// そのときは配置をせず、締切ごとの余裕だけを計算し直す。候補ごとの計画し直しは重い(CPU 10ms の制限)
	const fast = !input.exact && base.infeasible === 0;
	const capUCache = new Map<Ms, Minutes>();
	const capU = (d: Ms): Minutes => {
		let v = capUCache.get(d);
		if (v === undefined) {
			v = capacityUntil(capNext, d, "usual");
			capUCache.set(d, v);
		}
		return v;
	};

	const scored = candidates.map((t) => {
		// 空き時間のうち、公開日時より後の分しかこのタスクには使えない
		const usable = Math.max(0, Math.min(spareMin, (nextNow - (t.releaseAt ?? now)) / MINUTE));
		const work = Math.min(usable, t.remainingP80);
		const after = tasks
			.map((x) => (x.id === t.id ? { ...x, remainingP80: x.remainingP80 - work } : x))
			.filter((x) => x.remainingP80 > 1e-9);
		const done: Evaluation = fast
			? { infeasible: 0, ...demandBound(after, nextNow, capU) }
			: evaluate(after, capNext, nextNow, marginRatio);

		// 何も残らず山場がなくなったときは、片付けた分を改善量とする
		const bottleneckDelta =
			done.bottleneck === null || base.bottleneck === null
				? done.bottleneck === base.bottleneck
					? 0
					: work
				: done.bottleneck - base.bottleneck;

		let reason: SlackGain["reason"];
		if (isBigBlockNeeded(t, capNext, nextNow)) reason = "big_block";
		else if (t.uncertain === true) reason = "uncertain";
		else if (currentPeak !== null && t.dueAt <= currentPeak.dueAt) reason = "before_peak";
		else reason = "earliest";

		return {
			task: t,
			gain: {
				id: t.id,
				infeasibleDelta: done.infeasible - base.infeasible,
				bottleneckDeltaMin: snap(bottleneckDelta, 1e6),
				stressDelta: snap(stressOf(done.slacks, D, tau) - baseStress, 1e9),
				reason,
			} satisfies SlackGain,
		};
	});

	// 1の減少が大きい順 → 2の増加が大きい順 → 3の減少が大きい順 → 締切が早い → 残りが多い → ID
	scored.sort(
		(a, b) =>
			a.gain.infeasibleDelta - b.gain.infeasibleDelta ||
			b.gain.bottleneckDeltaMin - a.gain.bottleneckDeltaMin ||
			a.gain.stressDelta - b.gain.stressDelta ||
			a.task.dueAt - b.task.dueAt ||
			b.task.remainingP80 - a.task.remainingP80 ||
			cmpId(a.task.id, b.task.id),
	);
	return scored.map((s) => s.gain);
}
