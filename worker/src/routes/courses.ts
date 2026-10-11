import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { courses as coursesTable } from "../db/schema";
import type { Env } from "../env";
import { courseCreateSchema, courseUpdateSchema } from "../schemas/course";
import { idParamSchema, NOT_FOUND } from "../services/http";
import { validate } from "../services/validate";

export const courses = new Hono<Env>()
	.get("/", async (c) => c.json(await getDb(c.env).select().from(coursesTable).orderBy(asc(coursesTable.name)), 200))
	.post("/", validate("json", courseCreateSchema), async (c) => {
		const [row] = await getDb(c.env).insert(coursesTable).values(c.req.valid("json")).returning();
		return c.json(row, 201);
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
