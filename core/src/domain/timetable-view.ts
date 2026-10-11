// 時間割の画面用: ブロックの振り分け・曜日ごとのまとめ・単発の並べ方
import type { BusyBlock } from "../api/types";
import { formatMinuteOfDay } from "./time-input";
import {
	formatOneOff,
	formatSpan,
	isOneOff,
	isRecurring,
	KIND_LABEL,
	type OneOffBlock,
	type Period,
	periodOf,
	type RecurringBlock,
	WEEKDAY_LABEL,
	WEEKDAY_ORDER,
} from "./timetable";

const NO_NAME = "(名前なし)";

/** 繰り返し(毎週)と単発に分ける */
export function splitBusyBlocks(blocks: readonly BusyBlock[]): { recurring: RecurringBlock[]; oneOff: OneOffBlock[] } {
	return { recurring: blocks.filter(isRecurring), oneOff: blocks.filter(isOneOff) };
}

/** `10:40–12:10`(行の幅を詰めるため、`formatRange` より細い区切りを使う) */
const compactRange = (startMin: number, endMin: number) =>
	`${formatMinuteOfDay(startMin)}–${formatMinuteOfDay(endMin)}`;

export type WeekBlockView = {
	block: RecurringBlock;
	/** 登録した時限に当てはまるとき */
	period: Period | undefined;
	range: string;
	/** 名前。空なら `(名前なし)` */
	label: string;
	/** 期間つきの繰り返し(学期)の表示 */
	span: string | null;
	kind: string;
};

export type WeekRow = { weekday: number; label: string; blocks: WeekBlockView[] };

/** 月曜始まりの曜日ごとに、開始が早い順にまとめる。予定のない曜日も行は残す */
export function groupByWeekday(blocks: readonly RecurringBlock[], periods: readonly Period[]): WeekRow[] {
	return WEEKDAY_ORDER.map((weekday) => ({
		weekday,
		label: WEEKDAY_LABEL[weekday],
		blocks: blocks
			.filter((b) => b.weekday === weekday)
			.sort((a, b) => a.startMin - b.startMin)
			.map((block) => ({
				block,
				period: periodOf(block, periods),
				range: compactRange(block.startMin, block.endMin),
				label: block.label || NO_NAME,
				span: formatSpan(block),
				kind: KIND_LABEL[block.kind],
			})),
	}));
}

export type OneOffView = { block: OneOffBlock; text: string; label: string; kind: string; past: boolean };

/** 単発の予定を開始順に。終わったものは showPast のときだけ。pastCount は終わったものの数 */
export function listOneOffs(
	blocks: readonly OneOffBlock[],
	now: number,
	showPast: boolean,
): { rows: OneOffView[]; pastCount: number } {
	const sorted = [...blocks].sort((a, b) => a.startAt - b.startAt);
	const upcoming = sorted.filter((b) => b.endAt >= now);
	return {
		rows: (showPast ? sorted : upcoming).map((block) => ({
			block,
			text: formatOneOff(block),
			label: block.label || NO_NAME,
			kind: KIND_LABEL[block.kind],
			past: block.endAt < now,
		})),
		pastCount: sorted.length - upcoming.length,
	};
}
