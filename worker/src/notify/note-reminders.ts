// 通常の課題をメモへ変えたとき、保存済みの古い文面にも課題の催促を残さない。
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { notifications } from "../db/schema";

export async function clearNoteReminders(db: Db, taskId: string): Promise<void> {
	// 履歴の件数に応じた IN の束縛を作らず、未送信の集約先だけを参照する。
	// 送信済みまとめの元行は merged のまま残るため、復元対象にしてはいけない。
	const mergedTargets = sql`SELECT target.id FROM notifications target
		WHERE target.task_id IS NULL AND target.status IN ('pending', 'deferred')
		AND EXISTS (SELECT 1 FROM notifications source
			WHERE source.task_id = ${taskId}
			AND json_extract(source.payload, '$.mergedInto') = target.id)`;
	// 上限まとめは元行の carriedAt と集約先の不変な作成時刻で対応する。
	const cappedTargets = sql`SELECT target.id FROM notifications target
		WHERE target.task_id IS NULL AND target.status IN ('pending', 'deferred')
		AND json_extract(target.payload, '$.cappedCarry') = 1
		AND EXISTS (SELECT 1 FROM notifications source
			WHERE source.task_id = ${taskId}
			AND json_extract(source.payload, '$.capped') = 1
			AND json_extract(source.payload, '$.carriedAt') = coalesce(json_extract(target.payload, '$.cappedAt'), target.scheduled_at))`;
	await db.batch([
		db
			.update(notifications)
			.set({ status: "deferred", payload: sql`json_remove(${notifications.payload}, '$.mergedInto')` })
			.where(
				and(
					or(isNull(notifications.taskId), ne(notifications.taskId, taskId)),
					eq(notifications.status, "merged"),
					sql`json_extract(${notifications.payload}, '$.mergedInto') IN (${mergedTargets})`,
				),
			),
		db
			.update(notifications)
			.set({
				status: "deferred",
				payload: sql`json_remove(${notifications.payload}, '$.capped', '$.carriedAt')`,
			})
			.where(
				and(
					or(isNull(notifications.taskId), ne(notifications.taskId, taskId)),
					eq(notifications.status, "merged"),
					sql`json_extract(${notifications.payload}, '$.capped') = 1`,
					sql`json_extract(${notifications.payload}, '$.carriedAt') IN
						(SELECT coalesce(json_extract(payload, '$.cappedAt'), scheduled_at) FROM notifications WHERE id IN (${cappedTargets}))`,
				),
			),
		db
			.update(notifications)
			.set({ status: "skipped" })
			.where(
				and(eq(notifications.taskId, taskId), inArray(notifications.status, ["pending", "deferred", "merged"])),
			),
		// taskId=null の本文は整形済みなので、未送信の自動まとめを破棄する。
		// 保留・上限まとめの他課題は上で戻し、次の dispatch で再構成する。
		db
			.delete(notifications)
			.where(
				and(
					isNull(notifications.taskId),
					inArray(notifications.status, ["pending", "deferred"]),
					or(
						and(
							inArray(notifications.kind, ["digest", "weekly", "evening", "critical"]),
							sql`json_extract(${notifications.payload}, '$.dedupeKey') IS NOT NULL`,
						),
						sql`${notifications.id} IN (${mergedTargets})`,
						sql`${notifications.id} IN (${cappedTargets})`,
					),
				),
			),
	]);
}
