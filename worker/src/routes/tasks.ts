import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono } from "hono";
import * as v from "valibot";
import { getDb } from "../db";
import { TASK_STATUSES, taskDueHistory, tasks as tasksTable } from "../db/schema";
import type { Env } from "../env";
import { clearNoteReminders } from "../notify/note-reminders";
import { triggerReplan } from "../notify/replan";
import { notifySubmitted } from "../notify/webhook";
import { repeatSchema } from "../schemas/series";
import { taskCreateWithRepeatSchema, taskUpdateSchema } from "../schemas/task";
import { courseExists, INVALID_COURSE, idParamSchema, NOT_FOUND } from "../services/http";
import { createSeriesFromTask, repeatIssues } from "../services/series";
import { closeWorkOnTask } from "../services/status";
import { normalizeTaskKind } from "../services/task-kind";
import { validate } from "../services/validate";

// これらにしたら、そのタスクの作業は終わり
const CLOSING_STATUSES: readonly string[] = ["done", "submitted", "dismissed"];

/** すでに繰り返しに属するタスクに /repeat したときの 409 の本文 */
const ALREADY_REPEATING = { error: "already_repeating" } as const;

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
	.get("/", validate("query", taskListQuerySchema), async (c) => {
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
	.get("/:id", validate("param", idParamSchema), async (c) => {
		const [row] = await getDb(c.env)
			.select()
			.from(tasksTable)
			.where(eq(tasksTable.id, c.req.valid("param").id));
		return row ? c.json(row, 200) : c.json(NOT_FOUND, 404);
	})
	.post("/", validate("json", taskCreateWithRepeatSchema), async (c) => {
		const { repeat, ...rawInput } = c.req.valid("json");
		const input = normalizeTaskKind(rawInput);
		const db = getDb(c.env);
		if (input.courseId && !(await courseExists(db, input.courseId))) return c.json(INVALID_COURSE, 400);
		const issues = repeat ? repeatIssues(input.dueAt, repeat, "repeat.") : [];
		if (issues.length > 0) return c.json({ error: "invalid_input" as const, issues }, 400);
		const now = Date.now();
		const [created] = await db
			.insert(tasksTable)
			.values({ ...input, createdAt: now, updatedAt: now })
			.returning();
		// 繰り返しつきなら、このタスクを回 0 にしてシリーズを作る(応答は最初のタスクのまま)
		const row = repeat ? (await createSeriesFromTask(db, created, repeat, now)).task : created;
		triggerReplan(c);
		return c.json(row, 201);
	})
	// 既存のタスク(シリーズなし)を回 0 にして繰り返しを付ける
	.post("/:id/repeat", validate("param", idParamSchema), validate("json", repeatSchema), async (c) => {
		const { id } = c.req.valid("param");
		const repeat = c.req.valid("json");
		const db = getDb(c.env);
		const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
		if (!task) return c.json(NOT_FOUND, 404);
		if (task.seriesId) return c.json(ALREADY_REPEATING, 409);
		const issues = repeatIssues(task.dueAt, repeat);
		if (issues.length > 0) return c.json({ error: "invalid_input" as const, issues }, 400);
		const result = await createSeriesFromTask(db, task, repeat, Date.now());
		triggerReplan(c);
		return c.json(result, 200);
	})
	.patch("/:id", validate("param", idParamSchema), validate("json", taskUpdateSchema), async (c) => {
		const { id } = c.req.valid("param");
		const { silent = false, ...input } = c.req.valid("json");
		const rawPatch = { ...input, ...(input.status === "submitted" ? { status: "done" as const } : {}) };
		const db = getDb(c.env);
		const [current] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
		if (!current) return c.json(NOT_FOUND, 404);
		const taskKind = rawPatch.taskKind ?? current.taskKind;
		const estimateMin = rawPatch.estimateMin ?? current.estimateMin;
		if (taskKind === "work" && estimateMin < 1) {
			return c.json({ error: "invalid_input" as const, issues: ["estimateMin: 1以上の整数"] }, 400);
		}
		if (taskKind === "note" && rawPatch.status === "doing") {
			return c.json({ error: "invalid_input" as const, issues: ["status: メモは作業開始できない"] }, 400);
		}
		const becomingNote = taskKind === "note" && current.taskKind !== "note";
		const patch = normalizeTaskKind({
			...rawPatch,
			taskKind,
			estimateMin,
			...(taskKind === "note" ? { releaseAt: null, minBlockMin: 1 } : {}),
			...(becomingNote && current.status === "doing" && rawPatch.status === undefined
				? { status: "todo" as const }
				: {}),
		});
		if (patch.courseId && !(await courseExists(db, patch.courseId))) return c.json(INVALID_COURSE, 400);

		const now = Date.now();
		// submittedAt は互換名として保持し、完了時刻を記録する
		let submittedAt: number | null | undefined;
		if (patch.status && patch.status !== current.status) {
			if (patch.status === "done" && current.status !== "submitted") submittedAt = now;
			else if (patch.status !== "done" && (current.status === "done" || current.status === "submitted"))
				submittedAt = null;
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
		if (
			becomingNote ||
			(patch.status && patch.status !== current.status && CLOSING_STATUSES.includes(patch.status))
		) {
			extra.push(...closeWorkOnTask(db, id, now));
		}
		const [[row]] = await db.batch([update, ...extra]);
		if (becomingNote) await clearNoteReminders(db, id);
		triggerReplan(c);
		// 完了へ遷移したときだけ Discord / Slack に報告する(再送はしない)
		if (submittedAt === now) c.executionCtx.waitUntil(notifySubmitted(db, id, now, silent));
		return c.json(row, 200);
	})
	.delete("/:id", validate("param", idParamSchema), async (c) => {
		const [row] = await getDb(c.env)
			.delete(tasksTable)
			.where(eq(tasksTable.id, c.req.valid("param").id))
			.returning({ id: tasksTable.id });
		if (row) triggerReplan(c);
		return row ? c.json({ ok: true as const }, 200) : c.json(NOT_FOUND, 404);
	});
