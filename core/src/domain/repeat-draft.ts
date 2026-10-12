// 繰り返しの入力(確認カード・編集画面の「繰り返す」で共通)。仕様: ai-docs/specs/recurrence.md
import type { ParsedCandidate, RepeatInput } from "../api/types";
import { formatJstDate, startOfJstDay } from "./date";
import { previewOccurrences, type RepeatFreq, type RepeatRule, repeatLabel } from "./recurrence";

export type RepeatEnd = "none" | "count" | "until";

/** 編集中の繰り返し。回数は打ったままの文字列で持つ */
export type RepeatDraft = {
	/** none=繰り返さない */
	freq: RepeatFreq | "none";
	/** 1〜12。毎週の 2 = 隔週。毎週・隔週・毎月のチップ以外の値は AI が読んだときだけ入る */
	interval: number;
	end: RepeatEnd;
	/** end が count のとき。最初の回を含む回数 */
	count: string;
	/** end が until のとき。JST の日の 0:00(epoch ms)。未入力は null */
	until: number | null;
};

export const REPEAT_COUNT_MAX = 100;
/** 回数を選んだときの初期値(半期の授業の回数) */
const REPEAT_COUNT_DEFAULT = "15";
/** 予告に出す回数 */
const PREVIEW_COUNT = 3;

export const emptyRepeat = (): RepeatDraft => ({
	freq: "none",
	interval: 1,
	end: "none",
	count: REPEAT_COUNT_DEFAULT,
	until: null,
});

/** AI の解析の repeat → 確認カードの既定値。終わりは AI が決めないので無期限 */
export const repeatFromCandidate = (r: ParsedCandidate["repeat"]): RepeatDraft =>
	r ? { ...emptyRepeat(), freq: r.freq, interval: r.interval } : emptyRepeat();

export type RepeatChoice = { label: string; freq: RepeatDraft["freq"]; interval: number; selected: boolean };

const BASE_CHOICES: Omit<RepeatChoice, "selected">[] = [
	{ label: "なし", freq: "none", interval: 1 },
	{ label: "毎週", freq: "weekly", interval: 1 },
	{ label: "隔週", freq: "weekly", interval: 2 },
	{ label: "毎月", freq: "monthly", interval: 1 },
];

/** 「繰り返し」のチップ。AI が読んだ間隔がこの4つに当てはまらないとき(3週ごとなど)は、その選択肢を足す */
export function repeatChoices(r: RepeatDraft): RepeatChoice[] {
	const list = BASE_CHOICES.map((c) => ({
		...c,
		selected: c.freq === r.freq && (c.freq === "none" || c.interval === r.interval),
	}));
	if (r.freq !== "none" && !list.some((c) => c.selected)) {
		list.push({ label: repeatLabel(r.freq, r.interval), freq: r.freq, interval: r.interval, selected: true });
	}
	return list;
}

export const REPEAT_END_CHOICES: { value: RepeatEnd; label: string }[] = [
	{ value: "none", label: "無期限" },
	{ value: "count", label: "回数" },
	{ value: "until", label: "終了日" },
];

export const patchRepeat = (r: RepeatDraft, patch: Partial<RepeatDraft>): RepeatDraft => ({ ...r, ...patch });

export type RepeatProblems = { repeatCount?: string; repeatUntil?: string };

/** dueAt は最初の回の締切。終了日はその日より前にできない */
export function validateRepeat(r: RepeatDraft, dueAt: number | null): RepeatProblems {
	if (r.freq === "none") return {};
	if (r.end === "count") {
		const n = Number(r.count);
		if (!Number.isInteger(n) || n < 1 || n > REPEAT_COUNT_MAX)
			return { repeatCount: `1〜${REPEAT_COUNT_MAX}の整数` };
	}
	if (r.end === "until") {
		if (r.until === null) return { repeatUntil: "終了日が未入力" };
		if (dueAt !== null && r.until < startOfJstDay(dueAt)) return { repeatUntil: "終了日が締切より前" };
	}
	return {};
}

/** 検証済みの繰り返し → API に送る形。繰り返さないなら null。validateRepeat が通ったものだけ渡す */
export function repeatToInput(r: RepeatDraft): RepeatInput | null {
	if (r.freq === "none") return null;
	return {
		freq: r.freq,
		interval: r.interval,
		...(r.end === "count" ? { count: Number(r.count) } : {}),
		...(r.end === "until" && r.until !== null ? { until: r.until } : {}),
	};
}

/** 予告用のルール。繰り返さない・締切か終わりが未入力・不正なら null */
export function repeatRule(r: RepeatDraft, dueAt: number | null): RepeatRule | null {
	if (r.freq === "none" || dueAt === null) return null;
	const problems = validateRepeat(r, dueAt);
	if (problems.repeatCount || problems.repeatUntil) return null;
	return {
		freq: r.freq,
		interval: r.interval,
		anchorDueAt: dueAt,
		count: r.end === "count" ? Number(r.count) : null,
		until: r.end === "until" ? r.until : null,
	};
}

/** 確認カードの予告。`10/19(月)・10/26(月)・11/2(月)… 計15回`(無期限は計を出さない) */
export function repeatPreview(r: RepeatDraft, dueAt: number | null, now: number): string | null {
	const rule = repeatRule(r, dueAt);
	if (!rule) return null;
	const { dueAts, total, more } = previewOccurrences(rule, PREVIEW_COUNT, now);
	const dates = `${dueAts.map(formatJstDate).join("・")}${more ? "…" : ""}`;
	return total === null ? dates : `${dates} 計${total}回`;
}
