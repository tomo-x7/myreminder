// ふりかえり(#26)の表示用の値。事実だけを並べる(ストリークや責める言い方は使わない)
import type { Review, ReviewDay } from "../api/types";
import { formatJstDateTime, MINUTE } from "./date";
import { dateKeyParts, ratioText } from "./review";
import { formatHours } from "./schedule";

/** ふりかえりの画面のパス。week は月曜の日付。ふりかえりの `prevWeek` / `nextWeek` をそのまま渡す */
export const reviewPath = (week: string) => `/review?week=${week}`;

/** `期限内・締切の 1.5h前に提出(10/20(月) 10:40)`。期限後は事実だけ */
export function submittedText(t: Review["submitted"][number]): string {
	return `${t.onTime ? "期限内" : "期限後"}・締切の ${formatHours(Math.abs(t.dueAt - t.submittedAt) / MINUTE)}${
		t.onTime ? "前" : "後"
	}に提出(${formatJstDateTime(t.submittedAt)})`;
}

export type EstimateView = {
	/** 見積もりに対する実績の比率の言い方。比べられる記録がなければ null */
	text: string | null;
	/** この週に完了したものがなく、直近の週の値で言っているとき */
	fromLatestWeek: boolean;
	/** 8週の推移(スパークラインの説明文) */
	trendLabel: string;
};

/** 見積もりの精度。この週の中央値、なければ直近の週の値 */
export function estimateView({ estimate, estimateTrend }: Pick<Review, "estimate" | "estimateTrend">): EstimateView {
	const latest = [...estimateTrend].reverse().find((t) => t.medianRatio !== null)?.medianRatio ?? null;
	const ratio = estimate.medianRatio ?? latest;
	return {
		text: ratio === null ? null : ratioText(ratio),
		fromLatestWeek: ratio !== null && estimate.medianRatio === null,
		trendLabel: `見積もりに対する実績の比率の8週の推移。${estimateTrend
			.map((t) => (t.medianRatio === null ? "なし" : t.medianRatio.toFixed(1)))
			.join("、")}`,
	};
}

export type BarView = {
	date: string;
	/** 日付の日 */
	day: number;
	weekday: string;
	workedMin: number;
	/** 作業時間(なければ空) */
	hours: string;
	/** 棒の高さ(0〜100%)。週の中の最大に合わせる */
	percent: number;
	label: string;
	allNighter: boolean;
};

/** 7日の作業時間の棒。高さは週の中の最大に合わせる(最小 1 時間ぶんの高さ) */
export function weekBars(days: readonly ReviewDay[]): BarView[] {
	const max = Math.max(60, ...days.map((d) => d.workedMin));
	return days.map((d) => {
		const { day, weekday } = dateKeyParts(d.date);
		return {
			date: d.date,
			day,
			weekday,
			workedMin: d.workedMin,
			hours: d.workedMin > 0 ? formatHours(d.workedMin) : "",
			percent: (d.workedMin / max) * 100,
			label: `${weekday}曜 ${d.workedMin}分`,
			allNighter: d.allNighter,
		};
	});
}

export type SparklineView = {
	/** 見積もりどおり(1.0 倍)の線の高さ */
	baseline: number;
	/** データのない週で切れた、点の並び */
	segments: [number, number][][];
	points: { x: number; y: number; last: boolean }[];
};

/** 比率の推移の折れ線の座標。データのない週は線をつながない。値がひとつもなければ null */
export function sparkline(
	values: readonly (number | null)[],
	size: { width: number; height: number; pad: number },
): SparklineView | null {
	const present = values.filter((v): v is number => v !== null);
	if (present.length === 0) return null;
	const { width, height, pad } = size;
	const lo = Math.min(1, ...present);
	const hi = Math.max(1, ...present);
	const span = hi - lo || 1;
	const x = (i: number) => pad + (i * (width - 2 * pad)) / Math.max(1, values.length - 1);
	const y = (v: number) => pad + (1 - (v - lo) / span) * (height - 2 * pad);

	const segments: [number, number][][] = [];
	let current: [number, number][] = [];
	const points: SparklineView["points"] = [];
	values.forEach((v, i) => {
		if (v === null) {
			if (current.length > 0) segments.push(current);
			current = [];
			return;
		}
		current.push([x(i), y(v)]);
		points.push({ x: x(i), y: y(v), last: i === values.length - 1 });
	});
	if (current.length > 0) segments.push(current);
	return { baseline: y(1), segments, points };
}
