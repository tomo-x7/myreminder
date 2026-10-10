// 週次のふりかえり(DB 部分)。集計は review-helpers.ts。テーブルごとに1回だけ読む(CPU 10ms の制限のため)
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import type { Db } from "../db";
import { sessions, tasks } from "../db/schema";
import { DAY } from "../planner/types";
import { getSettings } from "../settings";
import { buildReview, currentMonday, parseWeekKey, type Review, TREND_WEEKS, weekRange } from "./review-helpers";

export type ReviewResult = { ok: true; review: Review } | { ok: false; error: "invalid_week" };

/** week = 月曜の YYYY-MM-DD。省略すると、直近の終わった週 */
export async function computeReview(db: Db, now: number, week: string | undefined): Promise<ReviewResult> {
	const { sleep } = await getSettings(db);
	const wakeMin = sleep.endMin;
	let monday: number;
	if (week === undefined) {
		monday = currentMonday(now, wakeMin) - 7;
	} else {
		const parsed = parseWeekKey(week);
		if (parsed === null) return { ok: false, error: "invalid_week" };
		monday = parsed;
	}

	// 見積もりの推移のため、8週前の週の頭から表示中の週の終わりまでに始まった作業を持つタスクを読む。
	// そのタスクの作業記録は、窓の外のぶんも含めてすべて読む(実績の合計に要るため)
	const windowStart = weekRange(monday - 7 * (TREND_WEEKS - 1), wakeMin).start - DAY;
	const windowEnd = weekRange(monday, wakeMin).end;
	const touched = db
		.select({ id: sessions.taskId })
		.from(sessions)
		.where(and(eq(sessions.kind, "actual"), gte(sessions.startAt, windowStart), lt(sessions.startAt, windowEnd)));
	const range = weekRange(monday, wakeMin);

	const [sessionRows, taskRows] = await db.batch([
		db
			.select({
				taskId: sessions.taskId,
				startAt: sessions.startAt,
				endAt: sessions.endAt,
				review: sessions.review,
			})
			.from(sessions)
			.where(and(eq(sessions.kind, "actual"), inArray(sessions.taskId, touched))),
		db
			.select({
				id: tasks.id,
				title: tasks.title,
				status: tasks.status,
				dueAt: tasks.dueAt,
				estimateMin: tasks.estimateMin,
				submittedAt: tasks.submittedAt,
			})
			.from(tasks)
			.where(
				or(
					and(gte(tasks.submittedAt, range.start), lt(tasks.submittedAt, range.end)),
					inArray(tasks.id, touched),
				),
			),
	]);

	return { ok: true, review: buildReview({ monday, now, sleep, sessions: sessionRows, tasks: taskRows }) };
}
