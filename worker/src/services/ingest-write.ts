// planIngest の結果を D1 に書く。書き込みは変わった行だけを batch でまとめる
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { ingestItems, notifications, taskDueHistory, tasks } from "../db/schema";
import type { Ms } from "../planner/types";
import type { IngestSource } from "../schemas/ingest";
import type { IngestPlan } from "./ingest";

/** 1回の batch に入れる文の数 */
const BATCH = 40;
/** D1 は1文あたり束縛できる値が100個まで。insert は列数に合わせて行数を絞る */
const INSERT_ITEMS = 6;
const INSERT_SMALL = 10;
/** lastSeenAt だけの更新を1文にまとめるときの id の数(束縛できる値の上限より少なく) */
const SEEN_IDS = 90;

const chunks = <T>(list: readonly T[], size: number): T[][] => {
	const out: T[][] = [];
	for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
	return out;
};

export async function applyIngestPlan(db: Db, source: IngestSource, plan: IngestPlan, now: Ms): Promise<void> {
	const statements: unknown[] = [];

	for (const part of chunks(plan.creates, INSERT_ITEMS)) {
		statements.push(
			db.insert(ingestItems).values(
				part.map((c) => ({
					source,
					externalId: c.externalId,
					title: c.title,
					courseName: c.courseName,
					dueAt: c.dueAt,
					url: c.url,
					remoteState: c.remoteState,
					payload: c.payload,
					status: c.status,
					firstSeenAt: c.firstSeenAt,
					lastSeenAt: c.lastSeenAt,
				})),
			),
		);
	}
	// 1日1回の lastSeenAt の更新は全行に起きるので、行ごとの文にせずまとめる(CPU と文の数のため)
	const seenOnly: string[] = [];
	for (const u of plan.updates) {
		const keys = Object.keys(u.set);
		if (keys.length === 1 && keys[0] === "lastSeenAt" && u.set.lastSeenAt === now) seenOnly.push(u.id);
		else statements.push(db.update(ingestItems).set(u.set).where(eq(ingestItems.id, u.id)));
	}
	for (const ids of chunks(seenOnly, SEEN_IDS)) {
		statements.push(db.update(ingestItems).set({ lastSeenAt: now }).where(inArray(ingestItems.id, ids)));
	}
	for (const t of plan.taskChanges) {
		statements.push(
			db
				.update(tasks)
				.set({ ...t.set, updatedAt: now })
				.where(eq(tasks.id, t.taskId)),
		);
	}
	const history = plan.taskChanges.flatMap((t) =>
		t.dueHistory.map((h) => ({
			taskId: t.taskId,
			oldDueAt: h.oldDueAt,
			newDueAt: h.newDueAt,
			changedAt: now,
			cause: "ingest" as const,
		})),
	);
	for (const part of chunks(history, INSERT_SMALL)) statements.push(db.insert(taskDueHistory).values(part));
	// dedupeKey を付けない: reconcile は触れず、dispatch がそのまま送る
	for (const part of chunks(plan.notifications, INSERT_SMALL)) {
		statements.push(
			db.insert(notifications).values(
				part.map((n) => ({
					taskId: n.taskId,
					kind: n.kind,
					priority: n.priority,
					scheduledAt: now,
					status: "pending" as const,
					payload: n.payload,
				})),
			),
		);
	}

	for (const part of chunks(statements, BATCH)) {
		await db.batch(part as unknown as Parameters<Db["batch"]>[0]);
	}
}
