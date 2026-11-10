// 通常の課題をメモへ変えたとき、保存済みの古い文面にも課題の催促を残さない。
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { notifications } from "../db/schema";

export async function clearNoteReminders(db: Db, taskId: string): Promise<void> {
	const sourceRows = await db
		.select({ payload: notifications.payload })
		.from(notifications)
		.where(eq(notifications.taskId, taskId));
	const mergedTargets = sourceRows.flatMap(({ payload }) => {
		if (!payload || typeof payload !== "object" || !("mergedInto" in payload)) return [];
		return typeof payload.mergedInto === "string" ? [payload.mergedInto] : [];
	});
	// taskId=null の本文は既に整形済みで、安全に一部の文字列だけ消せない。
	// 未送信の自動生成まとめは削除し、最新の課題集合から再計画する。
	// 保留まとめに含まれた他課題は deferred に戻して次の dispatch で再構成する。
	await db.batch([
		db
			.update(notifications)
			.set({ status: "skipped" })
			.where(
				and(eq(notifications.taskId, taskId), inArray(notifications.status, ["pending", "deferred", "merged"])),
			),
		db
			.update(notifications)
			.set({ status: "deferred", payload: sql`json_remove(${notifications.payload}, '$.mergedInto')` })
			.where(
				and(
					eq(notifications.status, "merged"),
					mergedTargets.length
						? sql`json_extract(${notifications.payload}, '$.mergedInto') IN (${sql.join(
								mergedTargets.map((id) => sql`${id}`),
								sql`, `,
							)})`
						: sql`0`,
				),
			),
		db
			.delete(notifications)
			.where(
				and(
					isNull(notifications.taskId),
					inArray(notifications.status, ["pending", "deferred"]),
					or(
						and(
							inArray(notifications.kind, ["digest", "weekly", "evening", "critical"]),
							sql`(json_extract(${notifications.payload}, '$.dedupeKey') IS NOT NULL OR json_extract(${notifications.payload}, '$.cappedCarry') = 1)`,
						),
						mergedTargets.length ? inArray(notifications.id, mergedTargets) : undefined,
					),
				),
			),
	]);
}
