// 使える時間(キャパ)。仕様: ai-docs/specs/planner.md §2.2
import {
	DAY,
	type Interval,
	JST_OFFSET,
	MINUTE,
	type Minutes,
	type Ms,
	type SleepWindow,
	type UsualCapacity,
} from "./types";

export type CapacityInput = {
	now: Ms;
	horizonDays: number; // 14
	busy: Interval[]; // 時間割(展開済み)・予定
	sleep: SleepWindow;
	usual: UsualCapacity;
	workedToday: Minutes; // 今の活動日にすでに作業した分
};

export type CapacityDay = { start: Ms; end: Ms; holiday: boolean; usualCap: Minutes };

export type Capacity = {
	free: Interval[]; // 本気のキャパ: 起きていて予定のない時間(now 以降、start 昇順・重ならない)
	days: CapacityDay[]; // 活動日の一覧(start 昇順で隙間なく並ぶ)
};

/** 長さ0以下を除き、start 昇順にして重なり・接する区間をまとめる */
function mergeIntervals(list: Interval[]): Interval[] {
	const sorted = list.filter((iv) => iv.end > iv.start).sort((a, b) => a.start - b.start || a.end - b.end);
	const out: Interval[] = [];
	for (const iv of sorted) {
		const last = out[out.length - 1];
		if (last && iv.start <= last.end) {
			if (iv.end > last.end) last.end = iv.end;
		} else {
			out.push({ start: iv.start, end: iv.end });
		}
	}
	return out;
}

/** 起床時刻と睡眠時間帯から、活動日の一覧と「起きていて予定のない時間」を作る */
export function buildCapacity(input: CapacityInput): Capacity {
	const { now, horizonDays, busy, sleep, usual, workedToday } = input;
	const horizonEnd = now + horizonDays * DAY;

	// JST の日付番号(1970-01-01 = 0)。dateStart(d) はその日の JST 0時
	const dateStart = (d: number): Ms => d * DAY - JST_OFFSET;
	const wakeOf = (d: number): Ms => dateStart(d) + sleep.endMin * MINUTE;

	const nowDate = Math.floor((now + JST_OFFSET) / DAY);
	// 起床前(睡眠中)なら、今は前の日の活動日に属する
	const firstDate = wakeOf(nowDate) <= now ? nowDate : nowDate - 1;

	const days: CapacityDay[] = [];
	let lastDate = firstDate;
	for (let d = firstDate; wakeOf(d) < horizonEnd; d++) {
		// 活動日の日付(= 起床した日)の曜日で休日を決める。1970-01-01 は木曜
		const dow = (((d + 4) % 7) + 7) % 7;
		const holiday = dow === 0 || dow === 6;
		const cap = holiday ? usual.holiday : usual.weekday;
		const usualCap = d === firstDate ? Math.max(0, cap - workedToday) : Math.max(0, cap);
		days.push({ start: wakeOf(d), end: wakeOf(d + 1), holiday, usualCap });
		lastDate = d;
	}

	// 睡眠の区間(日をまたぐ場合は翌日の endMin まで)
	const blocked: Interval[] = busy.map((iv) => ({ start: iv.start, end: iv.end }));
	if (sleep.startMin !== sleep.endMin) {
		const wraps = sleep.startMin > sleep.endMin;
		for (let d = firstDate - 1; d <= lastDate + 1; d++) {
			blocked.push({
				start: dateStart(d) + sleep.startMin * MINUTE,
				end: dateStart(d) + (wraps ? DAY : 0) + sleep.endMin * MINUTE,
			});
		}
	}

	// [now, horizonEnd) から blocked を引く
	const free: Interval[] = [];
	let cursor = now;
	for (const iv of mergeIntervals(blocked)) {
		if (iv.end <= cursor) continue;
		if (iv.start >= horizonEnd) break;
		if (iv.start > cursor) free.push({ start: cursor, end: iv.start });
		cursor = Math.max(cursor, iv.end);
	}
	if (cursor < horizonEnd) free.push({ start: cursor, end: horizonEnd });

	return { free, days };
}

/** [now, t) で使える分数。usual は活動日ごとに min(usualCap, その日の free ∩ [now, t)) を足す */
export function capacityUntil(cap: Capacity, t: Ms, mode: "usual" | "hard"): Minutes {
	const { free, days } = cap;
	if (mode === "hard") {
		let total = 0;
		for (const iv of free) {
			if (iv.start >= t) break;
			total += Math.min(iv.end, t) - iv.start;
		}
		return total / MINUTE;
	}
	const perDay = new Float64Array(days.length);
	let j = 0;
	for (const iv of free) {
		if (iv.start >= t) break;
		let a = iv.start;
		const b = Math.min(iv.end, t);
		// free は昇順なので、日のポインタは戻らない
		while (j < days.length && days[j].end <= a) j++;
		// 1つの free が複数の活動日にまたがる場合(睡眠なし)は日ごとに分ける
		for (let k = j; a < b && k < days.length; k++) {
			const seg = Math.min(b, days[k].end);
			perDay[k] += seg - a;
			a = seg;
		}
	}
	let total = 0;
	for (let k = 0; k < days.length; k++) total += Math.min(days[k].usualCap * MINUTE, perDay[k]);
	return total / MINUTE;
}
