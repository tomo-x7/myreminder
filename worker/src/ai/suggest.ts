// 「いつ始める?」の候補(AI は使わない)。plan.md §2.2-3
import {
	type BusyBlockRow,
	DEFAULT_SLEEP,
	expandBusyBlocks,
	expandSleep,
	type Interval,
	type SleepWindow,
} from "./busy";
import { DAY_MS, fromJstParts, HOUR_MS, MINUTE_MS, startOfJstDay, toJstParts, WEEKDAYS_JA } from "./jst";

export type StartSuggestion = { label: string; at: number };

const SLOT_MIN = 60;
const GRID_MS = 5 * MINUTE_MS;
const MIN_LEAD_MS = 10 * MINUTE_MS;
const NIGHT_HOUR = 21;
const EVENING_HOUR = 18;

const ceilTo = (ms: number, unit: number) => Math.ceil(ms / unit) * unit;
const hhmm = (ms: number) => {
	const p = toJstParts(ms);
	return `${p.hour}:${String(p.minute).padStart(2, "0")}`;
};

/** 今日/明日/10/14(火) */
function dayLabel(ms: number, now: number): string {
	const diff = Math.round((startOfJstDay(ms) - startOfJstDay(now)) / DAY_MS);
	if (diff === 0) return "今日";
	if (diff === 1) return "明日";
	const p = toJstParts(ms);
	return `${p.month}/${p.day}(${WEEKDAYS_JA[p.weekday]})`;
}

/** 候補のラベルは日と時刻だけ(`今日 21:00`)。「夕方」などの語は、空きがずれると時刻と食い違うので付けない */
const slotLabel = (ms: number, now: number) => `${dayLabel(ms, now)} ${hhmm(ms)}`;

/** [start, start+duration) が intervals のどれとも重ならない最初の開始時刻(from 以降、limit 未満)。なければ null */
export function findFreeSlot(
	from: number,
	durationMs: number,
	intervals: readonly Interval[],
	limit: number,
): number | null {
	const sorted = [...intervals].sort((a, b) => a.start - b.start);
	let t = ceilTo(from, GRID_MS);
	for (let guard = 0; guard < 1000 && t + durationMs <= limit; guard++) {
		const hit = sorted.find((i) => i.start < t + durationMs && i.end > t);
		if (!hit) return t;
		t = ceilTo(hit.end, GRID_MS);
	}
	return null;
}

export type SuggestInput = {
	now: number;
	busy: readonly BusyBlockRow[];
	sleep?: SleepWindow;
};

/**
 * 最大3件: 最短の空き / 今日の夜 / 明日の夕方。
 * 睡眠と、今日・明日の予定(授業・バイト)にかからない60分の枠だけを出す。近すぎる候補は後ろを落とす
 */
export function computeStartSuggestions({ now, busy, sleep = DEFAULT_SLEEP }: SuggestInput): StartSuggestion[] {
	const today = startOfJstDay(now);
	const horizon = today + 2 * DAY_MS; // 明日の終わり
	const slotMs = SLOT_MIN * MINUTE_MS;
	const intervals = [...expandBusyBlocks(busy, now, horizon + DAY_MS), ...expandSleep(sleep, now, horizon + DAY_MS)];

	const out: StartSuggestion[] = [];

	// 1. 最短の空き(今から10分後以降)
	const soonest = findFreeSlot(now + MIN_LEAD_MS, slotMs, intervals, horizon);
	if (soonest !== null) out.push({ label: slotLabel(soonest, now), at: soonest });

	// 2. 今日の夜: 21:00 がまだ先ならそこ。過ぎていれば 1時間後(5分単位に切り上げ)
	const night = fromJstParts(toJstParts(now).year, toJstParts(now).month, toJstParts(now).day, NIGHT_HOUR);
	const nightFrom = night > now + MIN_LEAD_MS ? night : now + HOUR_MS;
	const nightAt = findFreeSlot(nightFrom, slotMs, intervals, today + DAY_MS);
	if (nightAt !== null) out.push({ label: slotLabel(nightAt, now), at: nightAt });

	// 3. 明日の夕方 18:00
	const tomorrow = today + DAY_MS;
	const tp = toJstParts(tomorrow);
	const eveningAt = findFreeSlot(fromJstParts(tp.year, tp.month, tp.day, EVENING_HOUR), slotMs, intervals, horizon);
	if (eveningAt !== null) out.push({ label: slotLabel(eveningAt, now), at: eveningAt });

	// 近すぎる候補(30分以内)は選ぶ意味がないので、時刻順に見て後ろを落とす
	const result: StartSuggestion[] = [];
	for (const s of [...out].sort((a, b) => a.at - b.at)) {
		const prev = result[result.length - 1];
		if (!prev || s.at - prev.at >= 30 * MINUTE_MS) result.push(s);
	}
	return result;
}
