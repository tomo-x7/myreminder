// 繰り返し(シリーズ)の一覧と停止(仕様: ai-docs/specs/recurrence.md)。作成は tasks の POST / と POST /:id/repeat
import { desc } from "drizzle-orm";
import { Hono } from "hono";
import * as v from "valibot";
import { getDb } from "../db";
import { taskSeries } from "../db/schema";
import type { Env } from "../env";
import { triggerReplan } from "../notify/replan";
import { nextOccurrence } from "../planner/recurrence";
import { idParamSchema, NOT_FOUND } from "../services/http";
import { stopSeries } from "../services/series";
import { validate } from "../services/validate";

// afterIndex: その回より後だけを消す(見ている回は残す)。省略すると今より後の未着手の回をすべて消す
const stopBodySchema = v.object({ afterIndex: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))) });

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
	.post("/:id/stop", validate("param", idParamSchema), validate("json", stopBodySchema), async (c) => {
		const { afterIndex } = c.req.valid("json");
		const deleted = await stopSeries(getDb(c.env), c.req.valid("param").id, Date.now(), afterIndex);
		if (deleted === null) return c.json(NOT_FOUND, 404);
		triggerReplan(c);
		return c.json({ deleted }, 200);
	});
