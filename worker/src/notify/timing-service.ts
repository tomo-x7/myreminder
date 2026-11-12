// 既存の送信履歴・作業記録を読むだけ。学習用の新しいDB書き込みは不要。
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { notifications, sessions } from "../db/schema";
import type { Ms } from "../planner/types";
import { buildTimingModel, type TimingModel } from "./timing";

function timingPayload(payload: unknown): { sentAt: Ms | null; dedupeKey: string | null } {
	const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
	return {
		sentAt: typeof p.sentAt === "number" && Number.isFinite(p.sentAt) ? p.sentAt : null,
		dedupeKey: typeof p.dedupeKey === "string" ? p.dedupeKey : null,
	};
}

export async function loadTimingModel(db: Db, now: Ms): Promise<TimingModel> {
	const [first, sent, actual] = await Promise.all([
		db
			.select({ at: sql<number | null>`min(json_extract(${notifications.payload}, '$.sentAt'))` })
			.from(notifications)
			.where(eq(notifications.status, "sent")),
		db
			.select({
				id: notifications.id,
				taskId: notifications.taskId,
				payload: notifications.payload,
				kind: notifications.kind,
				status: notifications.status,
			})
			.from(notifications)
			.where(and(eq(notifications.status, "sent"), eq(notifications.kind, "risk"))),
		db
			.select({
				id: sessions.id,
				taskId: sessions.taskId,
				startAt: sessions.startAt,
				kind: sessions.kind,
				review: sessions.review,
			})
			.from(sessions)
			.where(and(eq(sessions.kind, "actual"), eq(sessions.review, "confirmed"))),
	]);
	return buildTimingModel(
		sent.map((n) => ({ ...n, ...timingPayload(n.payload) })),
		actual,
		now,
		first[0]?.at ?? null,
	);
}
