// 繰り返しの日付の計算と「どの回を作るか」の決定(仕様: ai-docs/specs/recurrence.md)。
// 純粋関数。DB・現在時刻に触れない。
// core/src/domain/recurrence.ts(確認カードの予告用)にも同じ計算がある。変えるときは両方そろえる
import { DAY_MS, fromJstParts, MINUTE_MS, startOfJstDay, toJstParts } from "../ai/jst";
import type { RepeatFreq } from "../db/schema";
import type { Ms } from "./types";

/** 回を先に作っておく範囲(plan §3.5 の計画が見る14日) */
export const MATERIALIZE_HORIZON = 14 * DAY_MS;
/** 1回の呼び出しで調べる回の上限(暴走防止。続きは次の cron で) */
export const MAX_ITERATIONS = 200;

export type RepeatRule = {
	freq: RepeatFreq;
	/** 1〜12。毎週の 2 = 隔週 */
	interval: number;
	/** 最初の回(番号 0)の締切 */
	anchorDueAt: Ms;
	/** 最初の回を含む回数。なしは null */
	count: number | null;
	/** JST の日の 0:00(その日の締切まで含む)。なしは null */
	until: Ms | null;
};

export type SeriesState = RepeatRule & {
	/** 次に作る回の番号 */
	materializedCount: number;
	stoppedAt: Ms | null;
};

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** 回 k(最初が 0)の締切。前の回からではなく、常に基準から計算する */
export function occurrenceDueAt(rule: RepeatRule, k: number): Ms {
	if (rule.freq === "weekly") return rule.anchorDueAt + k * rule.interval * 7 * DAY_MS;
	// 毎月: JST の年月を k × interval か月進める。日は基準の日(その月になければ月末)、時刻は基準と同じ
	const a = toJstParts(rule.anchorDueAt);
	const months = a.year * 12 + (a.month - 1) + k * rule.interval;
	const year = Math.floor(months / 12);
	const month = (months % 12) + 1;
	const day = Math.min(a.day, daysInMonth(year, month));
	// 分未満の端数(ms)は基準のまま
	return fromJstParts(year, month, day, a.hour, a.minute) + (rule.anchorDueAt % MINUTE_MS);
}

/** 回 k(締切 dueAt)が終わりの内か。count は k < count、until は締切が until の日の内 */
export function isWithinEnd(rule: RepeatRule, k: number, dueAt: Ms): boolean {
	if (rule.count !== null && k >= rule.count) return false;
	if (rule.until !== null && dueAt >= startOfJstDay(rule.until) + DAY_MS) return false;
	return true;
}

/**
 * 締切が now 以前であることが確かな回の番号の上限(そこまでは飛ばしてよい)。
 * 毎月は1か月が最大31日なので、interval × 31日で見積もると必ず「以前」の側に外れる
 */
function lastPastIndexHint(rule: RepeatRule, now: Ms): number {
	const period = rule.interval * (rule.freq === "weekly" ? 7 : 31) * DAY_MS;
	return Math.max(0, Math.floor((now - rule.anchorDueAt) / period));
}

export type MaterializationPlan = {
	/** 作る回の番号(昇順) */
	indices: number[];
	/** 作ったあとの materialized_count(次に作る回の番号) */
	nextMaterializedCount: number;
};

/**
 * 作る範囲: 締切が now + 14日 以内の回すべて。加えて、締切が now より後の回が1つもなければ次の1回。
 * 締切が now 以前の回は作らずに飛ばす(番号だけ進める)。終わりまで来たら止める。
 * 「後の回があるか」は、作ってある回(番号が materializedCount 未満の最後)の締切で判断する。
 * 消された回も作ったことになる(作り直さない)ので、DB の行は見ない
 */
export function planMaterialization(series: SeriesState, now: Ms): MaterializationPlan {
	const none = { indices: [], nextMaterializedCount: series.materializedCount };
	if (series.stoppedAt !== null) return none;

	const horizon = now + MATERIALIZE_HORIZON;
	let k = series.materializedCount;
	let hasFuture = k > 0 && occurrenceDueAt(series, k - 1) > now;
	// 過ぎた回が長く続くとき(過去のタスクを起点にしたとき)は、まとめて飛ばす(count を超えては進めない)
	k = Math.max(k, Math.min(lastPastIndexHint(series, now), series.count ?? Number.POSITIVE_INFINITY));

	const indices: number[] = [];
	for (let i = 0; i < MAX_ITERATIONS; i++) {
		const dueAt = occurrenceDueAt(series, k);
		if (!isWithinEnd(series, k, dueAt)) break;
		if (dueAt <= now) {
			k++;
			continue;
		}
		if (dueAt <= horizon) {
			indices.push(k++);
			hasFuture = true;
			continue;
		}
		// 14日より先: 後の回が1つもなければ、この1回だけ作る
		if (!hasFuture) indices.push(k++);
		break;
	}
	return { indices, nextMaterializedCount: k };
}

/** 締切が now より後の最初の回(終わりまで来ていれば null)。一覧の「次は…」用。止めたかどうかは見ない */
export function nextOccurrence(rule: RepeatRule, now: Ms): { index: number; dueAt: Ms } | null {
	let k = lastPastIndexHint(rule, now);
	for (let i = 0; i < MAX_ITERATIONS; i++, k++) {
		const dueAt = occurrenceDueAt(rule, k);
		if (!isWithinEnd(rule, k, dueAt)) return null;
		if (dueAt > now) return { index: k, dueAt };
	}
	return null;
}
