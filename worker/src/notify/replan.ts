// 再計画: 計画を計算 → 通知ポリシーで「これから送りたい通知」を作る → notifications テーブルと突き合わせる。
// 何度呼んでも同じ結果になる(冪等)。cron(毎時0分)と、タスク・予定・設定・ステータスの変更後に呼ぶ。
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { Context } from "hono";
import type { Db } from "../db";
import { getDb } from "../db";
import { busyBlocks, notifications, tasks } from "../db/schema";
import type { Env } from "../env";
import { expandBusyBlocks } from "../planner/busy";
import { DAY, type Ms } from "../planner/types";
import { computePlan } from "../services/planning";
import { getSettings } from "../settings";
import {
	type AnyKind,
	DAILY_DIGEST_KINDS,
	type DesiredNotification,
	generateNotifications,
	type HistoryItem,
	type PolicyTask,
} from "./policy";

const HISTORY_WINDOW = 14 * DAY;
const LONG_GAP = 3 * DAY;
const BATCH = 40;

type StoredPayload = {
	title?: string;
	body?: string;
	url?: string;
	dedupeKey?: string;
	stillWorkingSessionId?: string;
	attempts?: number;
	sentAt?: number;
};
const asPayload = (p: unknown): StoredPayload => (p && typeof p === "object" ? (p as StoredPayload) : {});

export type ReplanResult = { inserted: number; updated: number; deleted: number };

export async function replanNotifications(db: Db, now: Ms): Promise<ReplanResult> {
	const [cfg, plan, taskRows, blockRows, histRows, lastDigest] = await Promise.all([
		getSettings(db),
		computePlan(db, now),
		db
			.select()
			.from(tasks)
			.where(inArray(tasks.status, ["todo", "doing", "done"])),
		db.select().from(busyBlocks),
		db
			.select()
			.from(notifications)
			.where(and(ne(notifications.status, "pending"), gt(notifications.scheduledAt, now - HISTORY_WINDOW))),
		db
			.select({ at: sql<number | null>`max(json_extract(${notifications.payload}, '$.sentAt'))` })
			.from(notifications)
			.where(and(eq(notifications.status, "sent"), inArray(notifications.kind, [...DAILY_DIGEST_KINDS]))),
	]);

	const planById = new Map(plan.tasks.map((t) => [t.id, t]));
	const policyTasks: PolicyTask[] = taskRows.map((t) => {
		const p = planById.get(t.id);
		return {
			id: t.id,
			title: t.title,
			dueAt: t.dueAt,
			status: t.status as PolicyTask["status"],
			plannedStartAt: t.plannedStartAt,
			firstStep: t.firstStep,
			createdAt: t.createdAt,
			updatedAt: t.updatedAt,
			plan: p && {
				risk: p.risk,
				latestStartUsual: p.latestStartUsual,
				latestStartHard: p.latestStartHard,
				recommendedStart: p.recommendedStart,
				needsFullEffort: p.needsFullEffort,
				remainingP80: p.remainingP80,
			},
		};
	});

	const history: HistoryItem[] = histRows.map((r) => {
		const p = asPayload(r.payload);
		return {
			taskId: r.taskId,
			kind: r.kind as AnyKind,
			dedupeKey: p.dedupeKey ?? null,
			at: p.sentAt ?? r.scheduledAt,
			body: p.body ?? null,
		};
	});
	const lastDigestAt = lastDigest[0]?.at ?? null;

	const desired = generateNotifications({
		now,
		tasks: policyTasks,
		overdue: plan.overdue.map((o) => ({ id: o.id, title: o.title, dueAt: o.dueAt })),
		dropCandidates: plan.dropCandidates.map((o) => ({ id: o.id, title: o.title, dueAt: o.dueAt })),
		bottleneck: plan.bottleneck,
		busy: expandBusyBlocks(
			blockRows.filter((b) => b.kind === "class" || b.kind === "job"),
			now - DAY,
			now + 4 * DAY,
		),
		sleep: cfg.sleep,
		digest: cfg.digest,
		criticalDuringSleep: cfg.criticalDuringSleep,
		history,
		longGap: lastDigestAt !== null && now - lastDigestAt >= LONG_GAP,
	});

	return reconcile(db, now, desired, new Set(history.map((h) => h.dedupeKey).filter((k): k is string => !!k)));
}

/**
 * 未来の pending の通知を、desired に合わせる。
 * - dedupeKey が payload にない行(「まだやってる?」・テスト送信・まとめ)と、pending 以外の行には触れない
 * - 時刻が来ている(scheduledAt <= now)行と、送信を試みた行(attempts あり)は dispatch に任せて触れない
 * - すでに送った・保留した dedupeKey は作り直さない
 */
export async function reconcile(
	db: Db,
	now: Ms,
	desired: DesiredNotification[],
	doneKeys: Set<string>,
): Promise<ReplanResult> {
	const pending = await db.select().from(notifications).where(eq(notifications.status, "pending"));
	const byKey = new Map<string, (typeof pending)[number]>();
	const toDelete: string[] = [];
	for (const row of pending) {
		const p = asPayload(row.payload);
		if (!p.dedupeKey || p.stillWorkingSessionId) continue;
		if (byKey.has(p.dedupeKey)) {
			// 同時実行などで重複した行は片方だけ残す(時刻が来ているものは触れない)
			if (row.scheduledAt > now) toDelete.push(row.id);
			continue;
		}
		byKey.set(p.dedupeKey, row);
	}

	const want = new Map(desired.map((d) => [d.dedupeKey, d]));
	const inserts: (typeof notifications.$inferInsert)[] = [];
	const updates: ReturnType<typeof db.update>[] = [];
	let updated = 0;

	for (const [key, row] of byKey) {
		if (row.scheduledAt <= now || asPayload(row.payload).attempts) continue;
		const d = want.get(key);
		if (!d) {
			toDelete.push(row.id);
			continue;
		}
		const p = asPayload(row.payload);
		const same =
			row.scheduledAt === d.scheduledAt &&
			row.kind === d.kind &&
			row.priority === d.priority &&
			row.taskId === d.taskId &&
			p.title === d.payload.title &&
			p.body === d.payload.body &&
			p.url === d.payload.url;
		if (same) continue;
		updated++;
		updates.push(
			db
				.update(notifications)
				.set({
					scheduledAt: d.scheduledAt,
					kind: d.kind,
					priority: d.priority,
					taskId: d.taskId,
					payload: { ...p, ...d.payload, dedupeKey: key },
				})
				.where(and(eq(notifications.id, row.id), eq(notifications.status, "pending"))) as never,
		);
	}
	for (const d of desired) {
		if (byKey.has(d.dedupeKey) || doneKeys.has(d.dedupeKey)) continue;
		inserts.push({
			taskId: d.taskId,
			kind: d.kind,
			priority: d.priority,
			scheduledAt: d.scheduledAt,
			status: "pending",
			payload: { ...d.payload, dedupeKey: d.dedupeKey },
		});
	}

	const statements: unknown[] = [];
	for (let i = 0; i < toDelete.length; i += BATCH) {
		statements.push(db.delete(notifications).where(inArray(notifications.id, toDelete.slice(i, i + BATCH))));
	}
	for (let i = 0; i < inserts.length; i += BATCH) {
		statements.push(db.insert(notifications).values(inserts.slice(i, i + BATCH)));
	}
	statements.push(...updates);
	for (let i = 0; i < statements.length; i += BATCH) {
		const chunk = statements.slice(i, i + BATCH);
		await db.batch(chunk as unknown as Parameters<Db["batch"]>[0]);
	}
	return { inserted: inserts.length, updated, deleted: toDelete.length };
}

/**
 * ミューテーション後に再計画を予約する(レスポンスは待たせない)。
 * 実行コンテキストがない環境(テスト・一部の開発環境)では何もしない
 */
export function triggerReplan(c: Context<Env>): void {
	let ctx: Pick<ExecutionContext, "waitUntil">;
	try {
		ctx = c.executionCtx;
	} catch {
		return;
	}
	ctx.waitUntil(
		replanNotifications(getDb(c.env), Date.now()).catch((e) => {
			console.error("replan failed", e);
		}),
	);
}
