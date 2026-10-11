// 週次のふりかえり(仕様: ai-docs/specs/review.md)
import { Hono } from "hono";
import * as v from "valibot";
import { getDb } from "../db";
import type { Env } from "../env";
import { computeReview } from "../services/review";
import { validate } from "../services/validate";

const reviewQuerySchema = v.object({
	// その週の月曜(JST)の YYYY-MM-DD。省略すると直近の終わった週
	week: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
});

export const review = new Hono<Env>().get("/", validate("query", reviewQuerySchema), async (c) => {
	const result = await computeReview(getDb(c.env), Date.now(), c.req.valid("query").week);
	return result.ok ? c.json(result.review, 200) : c.json({ error: result.error }, 400);
});
