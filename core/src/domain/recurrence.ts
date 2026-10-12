// 繰り返しの日付の計算と、確認カード・編集画面に出す言い方(仕様: ai-docs/specs/recurrence.md)。
// 日付の計算は worker/src/planner/recurrence.ts と同じ。core は worker の実行コードを import できないので写してある。
// 変えるときは両方そろえる(worker 側にテストがある)
import { DAY, HOUR, jstParts, MINUTE, startOfJstDay } from "./date";

export type RepeatFreq = "weekly" | "monthly";

export type RepeatRule = {
	freq: RepeatFreq;
	/** 1〜12。毎週の 2 = 隔週 */
	interval: number;
	/** 最初の回(番号 0)の締切 */
	anchorDueAt: number;
	/** 最初の回を含む回数。なしは null */
	count: number | null;
	/** JST の日の 0:00(その日の締切まで含む)。なしは null */
	until: number | null;
};

const JST_OFFSET = 9 * HOUR;

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const fromJstParts = (year: number, month: number, day: number, hour: number, minute: number): number =>
	Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET;

/** 回 k(最初が 0)の締切。前の回からではなく、常に基準から計算する */
export function occurrenceDueAt(rule: RepeatRule, k: number): number {
	if (rule.freq === "weekly") return rule.anchorDueAt + k * rule.interval * 7 * DAY;
	// 毎月: JST の年月を k × interval か月進める。日は基準の日(その月になければ月末)、時刻は基準と同じ
	const a = jstParts(rule.anchorDueAt);
	const months = a.year * 12 + (a.month - 1) + k * rule.interval;
	const year = Math.floor(months / 12);
	const month = (months % 12) + 1;
	const day = Math.min(a.day, daysInMonth(year, month));
	// 分未満の端数(ms)は基準のまま
	return fromJstParts(year, month, day, a.hour, a.minute) + (rule.anchorDueAt % MINUTE);
}

/** 回 k(締切 dueAt)が終わりの内か。count は k < count、until は締切が until の日の内 */
export function isWithinEnd(rule: RepeatRule, k: number, dueAt: number): boolean {
	if (rule.count !== null && k >= rule.count) return false;
	if (rule.until !== null && dueAt >= startOfJstDay(rule.until) + DAY) return false;
	return true;
}

/** 締切が now 以前であることが確かな回の番号の上限(そこまでは飛ばしてよい)。毎月は1か月を最大31日で見積もる */
function lastPastIndexHint(rule: RepeatRule, now: number): number {
	const period = rule.interval * (rule.freq === "weekly" ? 7 : 31) * DAY;
	return Math.max(0, Math.floor((now - rule.anchorDueAt) / period));
}

/** 数え上げの上限。終了日が遠いときに無限に回らないため。超えたら合計は出さない */
const PREVIEW_MAX_STEPS = 1000;

export type OccurrencePreview = {
	/** 先頭から n 回分の締切 */
	dueAts: number[];
	/** 全部で何回作るか。無期限・数えきれないときは null */
	total: number | null;
	/** n 回より先にも回がある */
	more: boolean;
};

/**
 * 確認カードの予告用。作られる回の先頭 n 回と合計。
 * 最初の回は過ぎていても作る。2回目以降は、締切が now より後のものだけ作られる(過ぎた回は飛ばす)
 */
export function previewOccurrences(rule: RepeatRule, n: number, now: number): OccurrencePreview {
	const dueAts: number[] = [];
	const unlimited = rule.count === null && rule.until === null;
	let total = 0;
	let k = 0;
	for (let i = 0; i < PREVIEW_MAX_STEPS; i++) {
		const dueAt = occurrenceDueAt(rule, k);
		if (!isWithinEnd(rule, k, dueAt)) return { dueAts, total, more: total > dueAts.length };
		if (k === 0 || dueAt > now) {
			total++;
			if (dueAts.length < n) dueAts.push(dueAt);
			else if (unlimited) return { dueAts, total: null, more: true };
		}
		// 最初の回の次は、過ぎた回をまとめて飛ばす(count を超えては進めない)
		k =
			k === 0
				? Math.max(1, Math.min(lastPastIndexHint(rule, now), rule.count ?? Number.POSITIVE_INFINITY))
				: k + 1;
	}
	return { dueAts, total: null, more: true };
}

// ---------- 言い方 ----------

/** 毎週・隔週・毎月。それ以外の間隔は `3週ごと` `2か月ごと` */
export function repeatLabel(freq: RepeatFreq, interval: number): string {
	if (freq === "weekly") return interval === 1 ? "毎週" : interval === 2 ? "隔週" : `${interval}週ごと`;
	return interval === 1 ? "毎月" : `${interval}か月ごと`;
}

/** シリーズの何回目か。`3回目 / 全15回`・`3回目`(無期限)・`3回目 ・ 12/25まで`(終了日)。index は 0 始まり */
export function seriesPosition(series: Pick<RepeatRule, "count" | "until">, index: number): string {
	const nth = `${index + 1}回目`;
	if (series.count !== null) return `${nth} / 全${series.count}回`;
	if (series.until !== null) {
		const p = jstParts(series.until);
		return `${nth} ・ ${p.month}/${p.day}まで`;
	}
	return nth;
}

/** 編集画面の1行。`毎週 ・ 3回目 / 全15回`。止めたシリーズは末尾に `・ 止めた` */
export function seriesLine(
	series: Pick<RepeatRule, "freq" | "interval" | "count" | "until"> & { stoppedAt: number | null },
	index: number,
): string {
	const parts = [repeatLabel(series.freq, series.interval), seriesPosition(series, index)];
	if (series.stoppedAt !== null) parts.push("止めた");
	return parts.join(" ・ ");
}

/** シリーズ id → 一覧の行に付ける札(毎週・隔週・毎月…) */
export function seriesLabels(
	list: readonly { id: string; freq: RepeatFreq; interval: number }[],
): ReadonlyMap<string, string> {
	return new Map(list.map((s) => [s.id, repeatLabel(s.freq, s.interval)]));
}
