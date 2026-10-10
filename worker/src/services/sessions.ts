// 作業記録(sessions の kind = actual)の一覧・追加・編集・削除
import { and, asc, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import type { Db } from "../db";
import { sessions, tasks } from "../db/schema";
import type { Ms } from "../planner/types";

/** 終了していない記録は +∞ まで続くものとして重なりを見る。半開区間 [start, end) */
export function sessionsOverlap(a: { startAt: Ms; endAt: Ms | null }, b: { startAt: Ms; endAt: Ms | null }): boolean {
	return a.startAt < (b.endAt ?? Number.POSITIVE_INFINITY) && b.startAt < (a.endAt ?? Number.POSITIVE_INFINITY);
}

const columns = {
	id: sessions.id,
	taskId: sessions.taskId,
	startAt: sessions.startAt,
	endAt: sessions.endAt,
	progress: sessions.progress,
	review: sessions.review,
	edited: sessions.edited,
	taskTitle: tasks.title,
	taskEstimateMin: tasks.estimateMin,
};

const base = (db: Db) =>
	db.select(columns).from(sessions).innerJoin(tasks, eq(tasks.id, sessions.taskId)).orderBy(asc(sessions.startAt));

/** 開始時刻が [from, to) の実績 */
export function listSessions(db: Db, range: { from?: Ms; to?: Ms }) {
	return base(db).where(
		and(
			eq(sessions.kind, "actual"),
			range.from === undefined ? undefined : gte(sessions.startAt, range.from),
			range.to === undefined ? undefined : lt(sessions.startAt, range.to),
		),
	);
}

export function listReviewSessions(db: Db) {
	return base(db).where(and(eq(sessions.kind, "actual"), eq(sessions.review, "needs_review")));
}

export async function getSession(db: Db, id: string) {
	const [row] = await base(db).where(eq(sessions.id, id));
	return row;
}

/** 他の実績と重なるか(self は除く) */
async function hasOverlap(db: Db, range: { startAt: Ms; endAt: Ms | null }, selfId?: string): Promise<boolean> {
	const rows = await db
		.select({ startAt: sessions.startAt, endAt: sessions.endAt })
		.from(sessions)
		.where(
			and(
				eq(sessions.kind, "actual"),
				selfId ? ne(sessions.id, selfId) : undefined,
				// 候補を絞る: 相手の終了が自分の開始より後(未終了を含む)
				or(
					isNull(sessions.endAt),
					range.startAt === undefined ? undefined : gte(sessions.endAt, range.startAt),
				),
				range.endAt === null ? undefined : lt(sessions.startAt, range.endAt),
			),
		);
	return rows.some((r) => sessionsOverlap(range, r));
}

export type SessionWriteError = "task_not_found" | "invalid_range" | "overlap" | "not_found";

export async function createSession(
	db: Db,
	input: { taskId: string; startAt: Ms; endAt: Ms; progress?: number | null },
): Promise<{ ok: true; id: string } | { ok: false; error: SessionWriteError }> {
	if (input.endAt < input.startAt) return { ok: false, error: "invalid_range" };
	const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, input.taskId));
	if (!task) return { ok: false, error: "task_not_found" };
	if (await hasOverlap(db, input)) return { ok: false, error: "overlap" };
	const [row] = await db
		.insert(sessions)
		.values({
			taskId: input.taskId,
			kind: "actual",
			startAt: input.startAt,
			endAt: input.endAt,
			progress: input.progress ?? null,
			edited: true,
		})
		.returning({ id: sessions.id });
	return { ok: true, id: row?.id ?? "" };
}

export async function updateSession(
	db: Db,
	id: string,
	patch: { startAt?: Ms; endAt?: Ms; progress?: number | null; review?: "confirmed" },
): Promise<{ ok: true } | { ok: false; error: SessionWriteError }> {
	const [current] = await db
		.select()
		.from(sessions)
		.where(and(eq(sessions.id, id), eq(sessions.kind, "actual")));
	if (!current) return { ok: false, error: "not_found" };
	const startAt = patch.startAt ?? current.startAt;
	const endAt = patch.endAt ?? current.endAt;
	if (endAt !== null && endAt < startAt) return { ok: false, error: "invalid_range" };
	if (await hasOverlap(db, { startAt, endAt }, id)) return { ok: false, error: "overlap" };
	await db
		.update(sessions)
		.set({
			startAt,
			endAt,
			...(patch.progress !== undefined && { progress: patch.progress }),
			...(patch.review !== undefined && { review: patch.review }),
			edited: true,
		})
		.where(eq(sessions.id, id));
	return { ok: true };
}

export async function deleteSession(db: Db, id: string): Promise<boolean> {
	const rows = await db.delete(sessions).where(eq(sessions.id, id)).returning({ id: sessions.id });
	return rows.length > 0;
}
