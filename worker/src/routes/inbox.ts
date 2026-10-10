// 受信箱(仕様: ai-docs/specs/ingest.md §2)。取り込んだ課題を、本人が承認してはじめてタスクになる
import { vValidator } from "@hono/valibot-validator";
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { loadParseContext } from "../ai/parse";
import { computeStartSuggestions } from "../ai/suggest";
import { getDb } from "../db";
import { ingestItems, taskDueHistory, tasks } from "../db/schema";
import type { Env } from "../env";
import { triggerReplan } from "../notify/replan";
import { inboxLinkSchema } from "../schemas/inbox";
import { taskCreateSchema } from "../schemas/task";
import { courseExists, INVALID_COURSE, idParamSchema, NOT_FOUND } from "../services/http";
import { readPayload, readPendingChange } from "../services/ingest";
import { type CandidateReason, findCandidates } from "../services/ingest-candidates";

const NOT_PENDING = { error: "not_pending" } as const;
const NO_CHANGE = { error: "no_change" } as const;
const INVALID_TASK = { error: "invalid_task" } as const;
const DONE_STATES = ["TURNED_IN", "RETURNED"];

const pendingWhere = eq(ingestItems.status, "pending");
const changeWhere = and(eq(ingestItems.status, "linked"), isNotNull(ingestItems.pendingChange));

export const inbox = new Hono<Env>()
	.get("/", async (c) => {
		const db = getDb(c.env);
		const now = Date.now();
		const rows = await db
			.select({ item: ingestItems, taskTitle: tasks.title, taskDueAt: tasks.dueAt })
			.from(ingestItems)
			.leftJoin(tasks, eq(ingestItems.taskId, tasks.id))
			.where(or(pendingWhere, changeWhere));

		const pendingRows = rows.filter((r) => r.item.status === "pending");
		// 重複の候補と「いつ始める?」の候補は、承認待ちがあるときだけ用意する
		const ctx = pendingRows.length > 0 ? await loadParseContext(db) : null;
		const taskRows = ctx
			? await db
					.select({
						id: tasks.id,
						title: tasks.title,
						dueAt: tasks.dueAt,
						status: tasks.status,
						courseId: tasks.courseId,
					})
					.from(tasks)
					.where(ne(tasks.status, "dismissed"))
			: [];
		const courseById = new Map((ctx?.courses ?? []).map((co) => [co.id, co]));
		const taskById = new Map(taskRows.map((t) => [t.id, t]));
		const candidateTasks = taskRows.map((t) => {
			const co = t.courseId ? courseById.get(t.courseId) : undefined;
			return { id: t.id, title: t.title, dueAt: t.dueAt, courseNames: co ? [co.name, ...co.aliases] : [] };
		});

		// 締切の早い順、締切なしは最後
		const pending = pendingRows
			.map((r) => r.item)
			.sort((a, b) => (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY))
			.map((it) => {
				const payload = readPayload(it.payload);
				return {
					id: it.id,
					source: it.source,
					title: it.title,
					courseName: it.courseName,
					dueAt: it.dueAt,
					url: it.url,
					remoteState: it.remoteState,
					description: payload.description,
					kind: payload.kind,
					firstSeenAt: it.firstSeenAt,
					candidates: findCandidates(it, candidateTasks).flatMap((cand) => {
						const t = taskById.get(cand.taskId);
						if (!t) return [];
						const co = t.courseId ? courseById.get(t.courseId) : undefined;
						return [
							{
								taskId: t.id,
								reason: cand.reason satisfies CandidateReason,
								title: t.title,
								dueAt: t.dueAt,
								status: t.status,
								courseName: co?.name ?? null,
							},
						];
					}),
				};
			});

		const changes = rows
			.filter((r) => r.item.status === "linked" && r.item.taskId && r.taskTitle !== null && r.taskDueAt !== null)
			.map((r) => ({
				id: r.item.id,
				source: r.item.source,
				title: r.item.title,
				courseName: r.item.courseName,
				url: r.item.url,
				taskId: r.item.taskId as string,
				taskTitle: r.taskTitle as string,
				taskDueAt: r.taskDueAt as number,
				change: readPendingChange(r.item.pendingChange),
			}))
			.sort((a, b) => a.taskDueAt - b.taskDueAt);

		return c.json(
			{
				now,
				startSuggestions: ctx ? computeStartSuggestions({ now, busy: ctx.busy, sleep: ctx.sleep }) : [],
				pending,
				changes,
			},
			200,
		);
	})
	.get("/count", async (c) => {
		const [row] = await getDb(c.env)
			.select({
				pending: sql<number>`coalesce(sum(case when ${ingestItems.status} = 'pending' then 1 else 0 end), 0)`,
				changes: sql<number>`coalesce(sum(case when ${ingestItems.status} = 'linked' and ${ingestItems.pendingChange} is not null then 1 else 0 end), 0)`,
			})
			.from(ingestItems);
		return c.json({ pending: row?.pending ?? 0, changes: row?.changes ?? 0 }, 200);
	})
	.post("/:id/accept", vValidator("param", idParamSchema), vValidator("json", taskCreateSchema), async (c) => {
		const { id } = c.req.valid("param");
		const input = c.req.valid("json");
		const db = getDb(c.env);
		const [item] = await db.select().from(ingestItems).where(eq(ingestItems.id, id));
		if (!item) return c.json(NOT_FOUND, 404);
		if (item.status !== "pending") return c.json(NOT_PENDING, 409);
		if (input.courseId && !(await courseExists(db, input.courseId))) return c.json(INVALID_COURSE, 400);

		const now = Date.now();
		// 取り込み元で提出済みのものは、提出済みで作る
		const submitted = item.remoteState !== null && DONE_STATES.includes(item.remoteState);
		const taskId = crypto.randomUUID();
		const [[row]] = await db.batch([
			db
				.insert(tasks)
				.values({
					...input,
					id: taskId,
					...(submitted ? { status: "submitted" as const, submittedAt: now } : {}),
					createdAt: now,
					updatedAt: now,
				})
				.returning(),
			db
				.update(ingestItems)
				.set({ status: "linked", taskId })
				.where(and(eq(ingestItems.id, id), eq(ingestItems.status, "pending"))),
		]);
		triggerReplan(c);
		return c.json(row, 201);
	})
	.post("/:id/link", vValidator("param", idParamSchema), vValidator("json", inboxLinkSchema), async (c) => {
		const { id } = c.req.valid("param");
		const { taskId } = c.req.valid("json");
		const db = getDb(c.env);
		const [item] = await db.select().from(ingestItems).where(eq(ingestItems.id, id));
		if (!item) return c.json(NOT_FOUND, 404);
		if (item.status !== "pending") return c.json(NOT_PENDING, 409);
		const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId));
		if (!task) return c.json(INVALID_TASK, 400);
		// タスクの中身は変えない。以後、取り込み元の変化がこのタスクに伝わる
		await db
			.update(ingestItems)
			.set({ status: "linked", taskId })
			.where(and(eq(ingestItems.id, id), eq(ingestItems.status, "pending")));
		return c.json({ ok: true as const }, 200);
	})
	.post("/:id/ignore", vValidator("param", idParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const db = getDb(c.env);
		const [item] = await db.select({ status: ingestItems.status }).from(ingestItems).where(eq(ingestItems.id, id));
		if (!item) return c.json(NOT_FOUND, 404);
		if (item.status !== "pending") return c.json(NOT_PENDING, 409);
		await db
			.update(ingestItems)
			.set({ status: "ignored" })
			.where(and(eq(ingestItems.id, id), eq(ingestItems.status, "pending")));
		return c.json({ ok: true as const }, 200);
	})
	.post("/:id/change/accept", vValidator("param", idParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const db = getDb(c.env);
		const [item] = await db.select().from(ingestItems).where(eq(ingestItems.id, id));
		if (!item) return c.json(NOT_FOUND, 404);
		const change = readPendingChange(item.pendingChange);
		if (item.status !== "linked" || !item.taskId || (!change.dueAt && !change.title)) {
			return c.json(NO_CHANGE, 409);
		}
		const [task] = await db.select().from(tasks).where(eq(tasks.id, item.taskId));
		if (!task) return c.json(NO_CHANGE, 409);

		const now = Date.now();
		const patch: { title?: string; dueAt?: number } = {};
		if (change.title) patch.title = change.title.to;
		if (change.dueAt && change.dueAt.to !== task.dueAt) patch.dueAt = change.dueAt.to;
		const clear = db.update(ingestItems).set({ pendingChange: null }).where(eq(ingestItems.id, id));
		const update = db
			.update(tasks)
			.set({ ...patch, updatedAt: now })
			.where(eq(tasks.id, task.id));
		await (patch.dueAt === undefined
			? db.batch([update, clear])
			: db.batch([
					update,
					db.insert(taskDueHistory).values({
						taskId: task.id,
						oldDueAt: task.dueAt,
						newDueAt: patch.dueAt,
						changedAt: now,
						cause: "ingest",
					}),
					clear,
				]));
		triggerReplan(c);
		return c.json({ ok: true as const }, 200);
	})
	.post("/:id/change/dismiss", vValidator("param", idParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const [row] = await getDb(c.env)
			.update(ingestItems)
			.set({ pendingChange: null })
			.where(eq(ingestItems.id, id))
			.returning({ id: ingestItems.id });
		return row ? c.json({ ok: true as const }, 200) : c.json(NOT_FOUND, 404);
	});
