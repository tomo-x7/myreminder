// 普段のキャパの学習(仕様: ai-docs/specs/planner.md §2.1)
import type { Minutes, UsualCapacity } from "./types";

/** 活動日ごとの作業時間 */
export type DailyWork = { day: string /* 活動日 YYYY-MM-DD(JST) */; minutes: Minutes; holiday: boolean };

export type UsualCapacityOptions = {
	windowDays?: number;
	q?: number;
	minWorked?: Minutes;
	m?: number;
	defaults?: UsualCapacity;
	floor?: Minutes;
};

export const DEFAULT_USUAL_CAPACITY: UsualCapacity = { weekday: 180, holiday: 300 };

/** 線形補間の分位点(R の type 7)。sorted は昇順で空でないこと */
function quantile(sorted: number[], q: number): number {
	const h = (sorted.length - 1) * q;
	const lo = Math.floor(h);
	const hi = Math.ceil(h);
	return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (h - lo);
}

/** YYYY-MM-DD を UTC の通算日数にする(暦の差を数えるためだけに使う) */
function dayNumber(day: string): number {
	const [y, mo, d] = day.split("-").map(Number);
	return Date.UTC(y as number, (mo as number) - 1, d as number) / 86_400_000;
}

/**
 * 作業した日の分位点を、日数が少ないほど初期値に寄せて返す。
 * cap = (n·Q + m·default) / (n + m)。n = 0 なら初期値そのもの。
 */
function shrunk(workedMinutes: number[], q: number, m: number, def: Minutes, floor: Minutes): Minutes {
	const n = workedMinutes.length;
	if (n === 0) return Math.max(floor, def);
	const sorted = [...workedMinutes].sort((a, b) => a - b);
	const cap = (n * quantile(sorted, q) + m * def) / (n + m);
	return Math.max(floor, cap);
}

export function learnUsualCapacity(days: DailyWork[], opts: UsualCapacityOptions = {}): UsualCapacity {
	const { windowDays = 28, q = 0.75, minWorked = 30, m = 3, defaults = DEFAULT_USUAL_CAPACITY, floor = 60 } = opts;

	// 窓は「入力で一番新しい活動日」から数えた暦の日数。作業しなかった日が入力から抜けていても窓の幅は変わらない
	const nums = days.map((d) => dayNumber(d.day));
	const newest = Math.max(...nums);
	const weekday: number[] = [];
	const holiday: number[] = [];
	days.forEach((d, i) => {
		if (newest - (nums[i] as number) >= windowDays) return;
		if (d.minutes < minWorked) return;
		(d.holiday ? holiday : weekday).push(d.minutes);
	});

	return {
		weekday: shrunk(weekday, q, m, defaults.weekday, floor),
		holiday: shrunk(holiday, q, m, defaults.holiday, floor),
	};
}
