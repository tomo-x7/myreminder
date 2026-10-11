import { vValidator } from "@hono/valibot-validator";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono } from "hono";
import * as v from "valibot";
import { getDb } from "../db";
import { TASK_STATUSES, taskDueHistory, tasks as tasksTable } from "../db/schema";
import type { Env } from "../env";
import { triggerReplan } from "../notify/replan";
import { notifySubmitted } from "../notify/webhook";
import { taskCreateSchema, taskUpdateSchema } from "../schemas/task";
import { courseExists, INVALID_COURSE, idParamSchema, NOT_FOUND } from "../services/http";
import { closeWorkOnTask } from "../services/status";

// これらにしたら、そのタスクの作業は終わり
const CLOSING_STATUSES: readonly string[] = ["done", "submitted", "dismissed"];

const epochMsQuery = v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number));

// status はカンマ区切り(例: todo,doing)
const taskListQuerySchema = v.object({
	status: v.optional(
		v.pipe(
			v.string(),
			v.transform((s) => s.split(",").filter(Boolean)),
			v.array(v.picklist(TASK_STATUSES)),
		),
	),
	// dueAt < dueBefore
	dueBefore: v.optional(epochMsQuery),
	// dueAt >= dueAfter
	dueAfter: v.optional(epochMsQuery),
});

export const tasks = new Hono<Env>()
	.get("/", vValidator("query", taskListQuerySchema), async (c) => {
		const { status, dueBefore, dueAfter } = c.req.valid("query");
		const rows = await getDb(c.env)
			.select()
			.from(tasksTable)
			.where(
				and(
					status?.length ? inArray(tasksTable.status, status) : undefined,
					dueBefore === undefined ? undefined : lt(tasksTable.dueAt, dueBefore),
					dueAfter === undefined ? undefined : gte(tasksTable.dueAt, dueAfter),
				),
			)
			.orderBy(asc(tasksTable.dueAt));
		return c.json(rows, 200);
	})
	.get("/:id", vValidator("param", idParamSchema), async (c) => {
		const [row] = await getDb(c.env)
			.select()
			.from(tasksTable)
			.where(eq(tasksTable.id, c.req.valid("param").id));
		return row ? c.json(row, 200) : c.json(NOT_FOUND, 404);
	})
	.post("/", vValidator("json", taskCreateSchema), async (c) => {
		const input = c.req.valid("json");
		const db = getDb(c.env);
		if (input.courseId && !(await courseExists(db, input.courseId))) return c.json(INVALID_COURSE, 400);
		const now = Date.now();
		const [row] = await db
			.insert(tasksTable)
			.values({ ...input, createdAt: now, updatedAt: now })
			.returning();
		triggerReplan(c);
		return c.json(row, 201);
	})
	.patch("/:id", vValidator("param", idParamSchema), vValidator("json", taskUpdateSchema), async (c) => {
		const { id } = c.req.valid("param");
		const patch = c.req.valid("json");
		const db = getDb(c.env);
		const [current] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
		if (!current) return c.json(NOT_FOUND, 404);
		if (patch.courseId && !(await courseExists(db, patch.courseId))) return c.json(INVALID_COURSE, 400);

		const now = Date.now();
		// 提出済みにした時刻を記録し、提出済みから戻したら消す
		let submittedAt: number | null | undefined;
		if (patch.status && patch.status !== current.status) {
			if (patch.status === "submitted") submittedAt = now;
			else if (current.status === "submitted") submittedAt = null;
		}
		const update = db
			.update(tasksTable)
			.set({ ...patch, submittedAt, updatedAt: now })
			.where(eq(tasksTable.id, id))
			.returning();

		// 更新と同じバッチで原子的に: 締切が変わったら履歴に残す。
		// 完了・提出済み・取り下げにしたら、そのタスクの作業を閉じる(作業中のまま残さない)。
		// 進捗は書かない: 100 を書くと、あとで未着手に戻したとき残りが 0 になって計画から消えるため
		const extra: BatchItem<"sqlite">[] = [];
		if (patch.dueAt !== undefined && patch.dueAt !== current.dueAt) {
			extra.push(
				db.insert(taskDueHistory).values({
					taskId: id,
					oldDueAt: current.dueAt,
					newDueAt: patch.dueAt,
					changedAt: now,
					cause: "manual",
				}),
			);
		}
		if (patch.status && patch.status !== current.status && CLOSING_STATUSES.includes(patch.status)) {
			extra.push(...closeWorkOnTask(db, id, now));
		}
		const [[row]] = await db.batch([update, ...extra]);
		triggerReplan(c);
		// 提出済みにしたら Discord / Slack に報告する(レスポンスは待たせない)
		if (submittedAt === now) c.executionCtx.waitUntil(notifySubmitted(db, id, now));
		return c.json(row, 200);
	})
	.delete("/:id", vValidator("param", idParamSchema), async (c) => {
		const [row] = await getDb(c.env)
			.delete(tasksTable)
			.where(eq(tasksTable.id, c.req.valid("param").id))
			.returning({ id: tasksTable.id });
		if (row) triggerReplan(c);
		return row ? c.json({ ok: true as const }, 200) : c.json(NOT_FOUND, 404);
	});
