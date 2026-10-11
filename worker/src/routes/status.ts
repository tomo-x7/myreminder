import { vValidator } from "@hono/valibot-validator";
import { Hono } from "hono";
import { getDb } from "../db";
import type { Env } from "../env";
import { triggerReplan } from "../notify/replan";
import { statusSetSchema, workingStartSchema, workingStopSchema } from "../schemas/status";
import { findOpenSessions, getEffectiveStatus, setManualStatus, startWorking, stopWorking } from "../services/status";

export const status = new Hono<Env>()
	.get("/", async (c) => c.json(await getEffectiveStatus(getDb(c.env), Date.now()), 200))
	.put("/", vValidator("json", statusSetSchema), async (c) => {
		const { mode, until } = c.req.valid("json");
		const db = getDb(c.env);
		const now = Date.now();
		if (until !== null && until <= now) return c.json({ error: "invalid_until" as const }, 400);
		// 作業中は先に終わらせる(記録が宙に浮かないように)
		if ((await findOpenSessions(db)).length > 0) return c.json({ error: "working" as const }, 409);
		await setManualStatus(db, mode, until);
		triggerReplan(c);
		return c.json(await getEffectiveStatus(db, now), 200);
	})
	.post("/working", vValidator("json", workingStartSchema), async (c) => {
		const db = getDb(c.env);
		const now = Date.now();
		const result = await startWorking(db, c.req.valid("json").taskId, now);
		if (!result.ok) {
			// 提出済み・取り下げのタスクでは始められない
			return result.error === "task_closed"
				? c.json({ error: result.error }, 409)
				: c.json({ error: "not_found" as const }, 404);
		}
		triggerReplan(c);
		return c.json(await getEffectiveStatus(db, now), 200);
	})
	.post("/working/stop", vValidator("json", workingStopSchema), async (c) => {
		const db = getDb(c.env);
		const now = Date.now();
		const result = await stopWorking(db, c.req.valid("json"), now);
		if (!result.ok) {
			return result.error === "not_working"
				? c.json({ error: result.error }, 409)
				: c.json({ error: result.error }, 400);
		}
		triggerReplan(c);
		return c.json(await getEffectiveStatus(db, now), 200);
	});
