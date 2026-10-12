import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import * as v from "valibot";
import { getDb } from "../db";
import { busyBlocks as busyBlocksTable } from "../db/schema";
import type { Env } from "../env";
import { triggerReplan } from "../notify/replan";
import { busyBlockCreateSchema, busyBlockUpdateSchema } from "../schemas/busy-block";
import { ensureCourse } from "../services/courses";
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
		const db = getDb(c.env);
		const [row] = await db.insert(busyBlocksTable).values(c.req.valid("json")).returning();
		// 授業なら同じ名前の科目も作る
		if (row.kind === "class") await ensureCourse(db, row.label);
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
		// 名前を変えた・授業に切り替えたときだけ、新しい名前の科目を足す(既存の科目は残す)。
		// 時刻だけ直したときに作り直すと、本人が消した科目が戻ってしまう
		if (row.kind === "class" && (current.kind !== "class" || current.label !== row.label)) {
			await ensureCourse(db, row.label);
		}
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
