// 繰り返し(シリーズ)の作成・回の作成・停止(仕様: ai-docs/specs/recurrence.md)。
// 日付の計算と「どの回を作るか」は planner/recurrence.ts の純粋関数
import { and, eq, getTableColumns, gt, inArray, isNull, lt, notExists, sql } from "drizzle-orm";
import { DAY_MS, MINUTE_MS, startOfJstDay } from "../ai/jst";
import type { Db } from "../db";
import { type RepeatFreq, sessions, taskSeries, tasks } from "../db/schema";
import { occurrenceDueAt, planMaterialization } from "../planner/recurrence";
import type { Ms } from "../planner/types";

export type RepeatSpec = { freq: RepeatFreq; interval?: number; count?: number | null; until?: number | null };
export type TaskRow = typeof tasks.$inferSelect;
export type SeriesRow = typeof taskSeries.$inferSelect;

/** D1 は1文あたり束縛できる値が100個まで。tasks の insert は、既定値のある列も含めて列の数だけ束縛する */
const TASK_INSERT_ROWS = Math.max(1, Math.floor(100 / Object.keys(getTableColumns(tasks)).length));

/** 最初の回の締切が終わり(until)より後なら、入力の誤り。prefix は issues の項目名の接頭辞("repeat." など) */
export function repeatIssues(dueAt: Ms, repeat: RepeatSpec, prefix = ""): string[] {
	return repeat.until != null && dueAt >= startOfJstDay(repeat.until) + DAY_MS
		? [`${prefix}until: 最初の締切より前の日付`]
		: [];
}

/**
 * タスクを回 0 にしてシリーズを作り、先の回を作る。
 * 公開日時・着手時刻は締切からの差(分)で持ち、各回の締切に足す
 */
export async function createSeriesFromTask(
	db: Db,
	task: TaskRow,
	repeat: RepeatSpec,
	now: Ms,
): Promise<{ task: TaskRow; series: SeriesRow }> {
	const offsetMin = (at: Ms | null) => (at === null ? null : Math.round((at - task.dueAt) / MINUTE_MS));
	const seriesId = crypto.randomUUID();
	const [, [linked]] = await db.batch([
		db.insert(taskSeries).values({
			id: seriesId,
			title: task.title,
			courseId: task.courseId,
			category: task.category,
			estimateMin: task.estimateMin,
			estimateSource: task.estimateSource,
			minBlockMin: task.minBlockMin,
			firstStep: task.firstStep,
			note: task.note,
			freq: repeat.freq,
			interval: repeat.interval ?? 1,
			anchorDueAt: task.dueAt,
			releaseOffsetMin: offsetMin(task.releaseAt),
			plannedStartOffsetMin: offsetMin(task.plannedStartAt),
			count: repeat.count ?? null,
			until: repeat.until == null ? null : startOfJstDay(repeat.until),
			// 次に作る回の番号。このタスクが回 0
			materializedCount: 1,
			createdAt: now,
			updatedAt: now,
		}),
		db.update(tasks).set({ seriesId, seriesIndex: 0 }).where(eq(tasks.id, task.id)).returning(),
	]);
	await materializeSeries(db, now, [seriesId]);
	const [series] = await db.select().from(taskSeries).where(eq(taskSeries.id, seriesId));
	return { task: linked as TaskRow, series: series as SeriesRow };
}

/**
 * 動いているシリーズの先の回を作る(seriesIds があればそのシリーズだけ)。
 * 何度呼んでも増えない: (series_id, series_index) の一意制約で重複を捨てる。
 * 作った(または飛ばした)ぶんだけ materialized_count を進める。1つのシリーズが失敗しても残りは続ける
 */
export async function materializeSeries(db: Db, now: Ms, seriesIds?: string[]): Promise<{ created: number }> {
	if (seriesIds?.length === 0) return { created: 0 };
	const rows = await db
		.select()
		.from(taskSeries)
		.where(and(isNull(taskSeries.stoppedAt), seriesIds ? inArray(taskSeries.id, seriesIds) : undefined));

	let created = 0;
	for (const s of rows) {
		try {
			const { indices, nextMaterializedCount } = planMaterialization(s, now);
			if (nextMaterializedCount === s.materializedCount) continue;

			const values = indices.map((k): typeof tasks.$inferInsert => {
				const dueAt = occurrenceDueAt(s, k);
				return {
					seriesId: s.id,
					seriesIndex: k,
					title: s.title,
					courseId: s.courseId,
					category: s.category,
					estimateMin: s.estimateMin,
					estimateSource: s.estimateSource,
					minBlockMin: s.minBlockMin,
					firstStep: s.firstStep,
					note: s.note,
					dueAt,
					releaseAt: s.releaseOffsetMin === null ? null : dueAt + s.releaseOffsetMin * MINUTE_MS,
					plannedStartAt:
						s.plannedStartOffsetMin === null ? null : dueAt + s.plannedStartOffsetMin * MINUTE_MS,
					status: "todo",
					createdAt: now,
					updatedAt: now,
				};
			});
			const inserts = [];
			for (let i = 0; i < values.length; i += TASK_INSERT_ROWS) {
				inserts.push(
					db
						.insert(tasks)
						.values(values.slice(i, i + TASK_INSERT_ROWS))
						.onConflictDoNothing(),
				);
			}
			// 同時に動いた別の実行が先に進めていたら、戻さない
			const advance = db
				.update(taskSeries)
				.set({ materializedCount: nextMaterializedCount, updatedAt: now })
				.where(and(eq(taskSeries.id, s.id), lt(taskSeries.materializedCount, nextMaterializedCount)));
			await db.batch([advance, ...inserts]);
			created += values.length;
		} catch (e) {
			console.error(`materializeSeries failed: ${s.id}`, e);
		}
	}
	return { created };
}

/**
 * シリーズを止める。締切が now より後で、未着手(todo)かつ作業記録のない回を消す。
 * 戻り値は消した数。シリーズがなければ null。すでに止めてあれば止めた時刻はそのまま
 */
export async function stopSeries(db: Db, id: string, now: Ms): Promise<number | null> {
	const [current] = await db
		.select({ stoppedAt: taskSeries.stoppedAt })
		.from(taskSeries)
		.where(eq(taskSeries.id, id));
	if (!current) return null;
	const hasSessions = db.select({ one: sql`1` }).from(sessions).where(eq(sessions.taskId, tasks.id));
	const [, deleted] = await db.batch([
		db
			.update(taskSeries)
			.set({ stoppedAt: current.stoppedAt ?? now, updatedAt: now })
			.where(eq(taskSeries.id, id)),
		db
			.delete(tasks)
			.where(and(eq(tasks.seriesId, id), eq(tasks.status, "todo"), gt(tasks.dueAt, now), notExists(hasSessions)))
			.returning({ id: tasks.id }),
	]);
	return deleted.length;
}
