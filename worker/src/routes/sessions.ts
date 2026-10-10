import { vValidator } from "@hono/valibot-validator";
import { Hono } from "hono";
import { getDb } from "../db";
import type { Env } from "../env";
import { sessionCreateSchema, sessionListQuerySchema, sessionUpdateSchema } from "../schemas/status";
import { idParamSchema, NOT_FOUND } from "../services/http";
import {
	createSession,
	deleteSession,
	getSession,
	listReviewSessions,
	listSessions,
	updateSession,
} from "../services/sessions";

export const sessions = new Hono<Env>()
	.get("/", vValidator("query", sessionListQuerySchema), async (c) =>
		c.json(await listSessions(getDb(c.env), c.req.valid("query")), 200),
	)
	// :id より先に宣言する
	.get("/review", async (c) => c.json(await listReviewSessions(getDb(c.env)), 200))
	.post("/", vValidator("json", sessionCreateSchema), async (c) => {
		const db = getDb(c.env);
		const result = await createSession(db, c.req.valid("json"));
		if (!result.ok) {
			return result.error === "task_not_found"
				? c.json({ error: "invalid_task" as const }, 400)
				: result.error === "overlap"
					? c.json({ error: "overlap" as const }, 409)
					: c.json({ error: "invalid_range" as const }, 400);
		}
		const row = await getSession(db, result.id);
		return row ? c.json(row, 201) : c.json(NOT_FOUND, 404);
	})
	.patch("/:id", vValidator("param", idParamSchema), vValidator("json", sessionUpdateSchema), async (c) => {
		const { id } = c.req.valid("param");
		const db = getDb(c.env);
		const result = await updateSession(db, id, c.req.valid("json"));
		if (!result.ok) {
			return result.error === "not_found"
				? c.json(NOT_FOUND, 404)
				: result.error === "overlap"
					? c.json({ error: "overlap" as const }, 409)
					: c.json({ error: "invalid_range" as const }, 400);
		}
		const row = await getSession(db, id);
		return row ? c.json(row, 200) : c.json(NOT_FOUND, 404);
	})
	.delete("/:id", vValidator("param", idParamSchema), async (c) =>
		(await deleteSession(getDb(c.env), c.req.valid("param").id))
			? c.json({ ok: true as const }, 200)
			: c.json(NOT_FOUND, 404),
	);
