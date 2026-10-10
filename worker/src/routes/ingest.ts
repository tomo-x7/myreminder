import { vValidator } from "@hono/valibot-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { ingestItems, tasks } from "../db/schema";
import type { Env } from "../env";
import { triggerReplan } from "../notify/replan";
import { notifySubmitted } from "../notify/webhook";
import { ingestSnapshotSchema, ingestSourceParamSchema } from "../schemas/ingest";
import { type ExistingItem, type LinkedTask, planIngest } from "../services/ingest";
import { applyIngestPlan } from "../services/ingest-write";

/** 提出済みの報告(webhook)を1回の取り込みで送る上限。サブリクエストの枠を使い切らないため */
const MAX_SUBMITTED_REPORTS = 5;

// 保護は Cloudflare Access の Service Token(/api/ingest/*)。ここに認証のコードは書かない
export const ingest = new Hono<Env>()
	.get("/ping", (c) => c.json({ ok: true as const }, 200))
	.post(
		"/:source",
		vValidator("param", ingestSourceParamSchema),
		vValidator("json", ingestSnapshotSchema),
		async (c) => {
			const { source } = c.req.valid("param");
			const { items } = c.req.valid("json");
			const db = getDb(c.env);
			const now = Date.now();

			// その source の行を1回の select でまとめて読む(紐付け先のタスクも一緒に)
			const rows = await db
				.select({
					item: ingestItems,
					taskTitle: tasks.title,
					taskDueAt: tasks.dueAt,
					taskStatus: tasks.status,
				})
				.from(ingestItems)
				.leftJoin(tasks, eq(ingestItems.taskId, tasks.id))
				.where(eq(ingestItems.source, source));

			const existing: ExistingItem[] = [];
			const linked = new Map<string, LinkedTask>();
			for (const r of rows) {
				existing.push(r.item);
				if (r.item.taskId && r.taskTitle !== null && r.taskDueAt !== null && r.taskStatus !== null) {
					linked.set(r.item.taskId, {
						id: r.item.taskId,
						title: r.taskTitle,
						dueAt: r.taskDueAt,
						status: r.taskStatus,
					});
				}
			}

			const plan = planIngest({ now, existing, snapshot: items, tasks: linked });
			await applyIngestPlan(db, source, plan, now);

			if (plan.taskChanges.length > 0) triggerReplan(c);
			if (plan.submittedTaskIds.length > 0) {
				c.executionCtx.waitUntil(
					Promise.all(
						plan.submittedTaskIds.slice(0, MAX_SUBMITTED_REPORTS).map((id) => notifySubmitted(db, id, now)),
					),
				);
			}
			return c.json(plan.result, 200);
		},
	);
