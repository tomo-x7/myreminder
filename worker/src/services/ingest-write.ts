// planIngest の結果を D1 に書く。書き込みは変わった行だけを batch でまとめる
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "../db";
import { ingestItems, notifications, taskDueHistory, tasks } from "../db/schema";
import type { Ms } from "../planner/types";
import type { IngestSource } from "../schemas/ingest";
import type { IngestPlan } from "./ingest";
import { closeWorkOnTask } from "./status";
import { nextTaskUpdatedAt } from "./task-write";

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

export async function applyIngestPlan(db: Db, source: IngestSource, plan: IngestPlan, now: Ms): Promise<string[]> {
	const completionStatements = new Set<unknown>();
	const completedTaskIds: string[] = [];
	const batches: unknown[][] = [];
	let statements: unknown[] = [];
	// 完了更新と作業終了は、40文の境界でも同じ原子的batchに保つ。
	const pushStatements = (...group: unknown[]) => {
		if (statements.length + group.length > BATCH) {
			batches.push(statements);
			statements = [];
		}
		statements.push(...group);
	};

	for (const part of chunks(plan.creates, INSERT_ITEMS)) {
		pushStatements(
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
		else pushStatements(db.update(ingestItems).set(u.set).where(eq(ingestItems.id, u.id)));
	}
	for (const ids of chunks(seenOnly, SEEN_IDS)) {
		pushStatements(db.update(ingestItems).set({ lastSeenAt: now }).where(inArray(ingestItems.id, ids)));
	}
	for (const t of plan.taskChanges) {
		if (t.set.status === "done") {
			const { status, submittedAt, ...other } = t.set;
			// 計画を読んだ後に手動操作や別の取り込みが先に完了することがある。
			// 完了だけは実際の遷移を取得し、通知と完了時刻の上書きを防ぐ。
			const completion = db
				.update(tasks)
				.set({ status, submittedAt, updatedAt: nextTaskUpdatedAt(now) })
				.where(and(eq(tasks.id, t.taskId), notInArray(tasks.status, ["done", "submitted"])))
				.returning({ id: tasks.id });
			completionStatements.add(completion);
			pushStatements(
				// 同じ変更に含まれる締切は、完了済みになっていても反映する。
				...(Object.keys(other).length > 0
					? [
							db
								.update(tasks)
								.set({ ...other, updatedAt: nextTaskUpdatedAt(now) })
								.where(eq(tasks.id, t.taskId)),
						]
					: []),
				completion,
				...closeWorkOnTask(db, t.taskId, now),
			);
		} else {
			pushStatements(
				db
					.update(tasks)
					.set({ ...t.set, updatedAt: nextTaskUpdatedAt(now) })
					.where(eq(tasks.id, t.taskId)),
			);
		}
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
	for (const part of chunks(history, INSERT_SMALL)) pushStatements(db.insert(taskDueHistory).values(part));
	// dedupeKey を付けない: reconcile は触れず、dispatch がそのまま送る
	for (const part of chunks(plan.notifications, INSERT_SMALL)) {
		pushStatements(
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

	if (statements.length > 0) batches.push(statements);
	for (const part of batches) {
		const results = await db.batch(part as unknown as Parameters<Db["batch"]>[0]);
		for (let i = 0; i < part.length; i++) {
			if (!completionStatements.has(part[i])) continue;
			for (const row of results[i] as unknown as { id: string }[]) completedTaskIds.push(row.id);
		}
	}
	return completedTaskIds;
}
