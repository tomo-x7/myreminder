import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import * as v from "valibot";
import { getDb } from "../db";
import { busyBlocks as busyBlocksTable } from "../db/schema";
import type { Env } from "../env";
import { triggerReplan } from "../notify/replan";
import { busyBlockCreateSchema, busyBlockUpdateSchema } from "../schemas/busy-block";
import { idParamSchema, NOT_FOUND } from "../services/http";
import { formatIssues, validate } from "../services/validate";

export const busyBlocks = new Hono<Env>()
	.get("/", async (c) =>
		c.json(
			await getDb(c.env)
				.select()
				.from(busyBlocksTable)
				.orderBy(asc(busyBlocksTable.weekday), asc(busyBlocksTable.startMin), asc(busyBlocksTable.startAt)),
			200,
		),
	)
	.post("/", validate("json", busyBlockCreateSchema), async (c) => {
		const [row] = await getDb(c.env).insert(busyBlocksTable).values(c.req.valid("json")).returning();
		triggerReplan(c);
		return c.json(row, 201);
	})
	.patch("/:id", validate("param", idParamSchema), validate("json", busyBlockUpdateSchema), async (c) => {
		const { id } = c.req.valid("param");
		const db = getDb(c.env);
		const [current] = await db.select().from(busyBlocksTable).where(eq(busyBlocksTable.id, id));
		if (!current) return c.json(NOT_FOUND, 404);
		// 既存の行に重ねてから、作成時と同じ検証をかける(繰り返し/単発の整合も見る)
		const { id: _id, ...currentFields } = current;
		const merged = v.safeParse(busyBlockCreateSchema, { ...currentFields, ...c.req.valid("json") });
		if (!merged.success) {
			return c.json({ error: "invalid_busy_block", issues: formatIssues(merged.issues) }, 400);
		}
		const [row] = await db.update(busyBlocksTable).set(merged.output).where(eq(busyBlocksTable.id, id)).returning();
		triggerReplan(c);
		return c.json(row, 200);
	})
	.delete("/:id", validate("param", idParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const [row] = await getDb(c.env)
			.delete(busyBlocksTable)
			.where(eq(busyBlocksTable.id, id))
			.returning({ id: busyBlocksTable.id });
		if (row) triggerReplan(c);
		return row ? c.json({ ok: true as const }, 200) : c.json(NOT_FOUND, 404);
	});
