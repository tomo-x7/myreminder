import { DAY, type Interval, JST_OFFSET, MINUTE, type Ms } from "./types";

/** busy_blocks の行と同じ形(drizzle に依存しないよう構造で受ける) */
export type BusyBlockLike = {
	id: string;
	kind: string;
	label: string;
	// 繰り返し: weekday(0=日〜6=土、JST)+ JST 0時からの分 + 任意の期間(その日を含む)
	weekday: number | null;
	startMin: number | null;
	endMin: number | null;
	dateFrom: Ms | null;
	dateTo: Ms | null;
	// 単発
	startAt: Ms | null;
	endAt: Ms | null;
};

export type BusyInterval = Interval & { id: string; kind: string; label: string };

/** t を含む JST の日の 0:00 */
export function jstDayStart(t: Ms): Ms {
	return Math.floor((t + JST_OFFSET) / DAY) * DAY - JST_OFFSET;
}

export function jstWeekday(t: Ms): number {
	return new Date(t + JST_OFFSET).getUTCDay();
}

/** [from, to) と重なる予定を区間に展開する。区間は [from, to) に切り詰め、開始時刻 → id の順に並べる */
export function expandBusyBlocks(blocks: BusyBlockLike[], from: Ms, to: Ms): BusyInterval[] {
	const out: BusyInterval[] = [];
	const push = (b: BusyBlockLike, start: Ms, end: Ms) => {
		const s = Math.max(start, from);
		const e = Math.min(end, to);
		if (s < e) out.push({ start: s, end: e, id: b.id, kind: b.kind, label: b.label });
	};
	for (const b of blocks) {
		if (b.startAt != null && b.endAt != null) {
			push(b, b.startAt, b.endAt);
			continue;
		}
		if (b.weekday == null || b.startMin == null || b.endMin == null) continue;
		const firstDay = b.dateFrom != null ? Math.max(jstDayStart(from), jstDayStart(b.dateFrom)) : jstDayStart(from);
		const lastDay = b.dateTo != null ? Math.min(jstDayStart(to - 1), jstDayStart(b.dateTo)) : jstDayStart(to - 1);
		for (let day = firstDay; day <= lastDay; day += DAY) {
			if (jstWeekday(day) !== b.weekday) continue;
			push(b, day + b.startMin * MINUTE, day + b.endMin * MINUTE);
		}
	}
	return out.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
