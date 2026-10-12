// 繰り返し(シリーズ)の一覧と停止(仕様: ai-docs/specs/recurrence.md)。作成は tasks の POST / と POST /:id/repeat
import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { taskSeries } from "../db/schema";
import type { Env } from "../env";
import { triggerReplan } from "../notify/replan";
import { nextOccurrence } from "../planner/recurrence";
import { idParamSchema, NOT_FOUND } from "../services/http";
import { stopSeries } from "../services/series";
import { validate } from "../services/validate";

export const series = new Hono<Env>()
	// 止めたものも含む。nextDueAt は締切が今より後の最初の回(終わった・止めたシリーズは null)
	.get("/", async (c) => {
		const now = Date.now();
		const rows = await getDb(c.env).select().from(taskSeries).orderBy(desc(taskSeries.createdAt));
		return c.json(
			rows.map((s) => ({
				...s,
				nextDueAt: s.stoppedAt === null ? (nextOccurrence(s, now)?.dueAt ?? null) : null,
			})),
			200,
		);
	})
	.post("/:id/stop", validate("param", idParamSchema), async (c) => {
		const deleted = await stopSeries(getDb(c.env), c.req.valid("param").id, Date.now());
		if (deleted === null) return c.json(NOT_FOUND, 404);
		triggerReplan(c);
		return c.json({ deleted }, 200);
	});
