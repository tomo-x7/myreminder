import { asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { courses as coursesTable } from "../db/schema";
import type { Env } from "../env";
import { courseCreateSchema, courseUpdateSchema } from "../schemas/course";
import { idParamSchema, idsBodySchema, NOT_FOUND } from "../services/http";
import { validate } from "../services/validate";

export const courses = new Hono<Env>()
	.get("/", async (c) => c.json(await getDb(c.env).select().from(coursesTable).orderBy(asc(coursesTable.name)), 200))
	.post("/", validate("json", courseCreateSchema), async (c) => {
		const [row] = await getDb(c.env).insert(coursesTable).values(c.req.valid("json")).returning();
		return c.json(row, 201);
	})
	// tasks.course_id は on delete set null。ない id は無視。replan は不要(既存の科目削除もしていない)
	.post("/bulk-delete", validate("json", idsBodySchema), async (c) => {
		const { ids } = c.req.valid("json");
		const rows = await getDb(c.env)
			.delete(coursesTable)
			.where(inArray(coursesTable.id, ids))
			.returning({ id: coursesTable.id });
		return c.json({ deleted: rows.length }, 200);
	})
	.patch("/:id", validate("param", idParamSchema), validate("json", courseUpdateSchema), async (c) => {
		const { id } = c.req.valid("param");
		const patch = c.req.valid("json");
		const db = getDb(c.env);
		const [row] = Object.keys(patch).length
			? await db.update(coursesTable).set(patch).where(eq(coursesTable.id, id)).returning()
			: await db.select().from(coursesTable).where(eq(coursesTable.id, id));
		return row ? c.json(row, 200) : c.json(NOT_FOUND, 404);
	})
	.delete("/:id", validate("param", idParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		// tasks.course_id は on delete set null
		const [row] = await getDb(c.env)
			.delete(coursesTable)
			.where(eq(coursesTable.id, id))
			.returning({ id: coursesTable.id });
		return row ? c.json({ ok: true as const }, 200) : c.json(NOT_FOUND, 404);
	});
