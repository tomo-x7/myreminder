// 見積もりの参照(入力欄の下に出す過去の実績。仕様: ai-docs/specs/planner.md §1)
import { Hono } from "hono";
import * as v from "valibot";
import { getDb } from "../db";
import { TASK_CATEGORIES } from "../db/schema";
import type { Env } from "../env";
import { computeReference } from "../services/estimates";
import { validate } from "../services/validate";

const idQuery = v.optional(v.pipe(v.string(), v.minLength(1)));

const referenceQuerySchema = v.object({
	category: v.picklist(TASK_CATEGORIES),
	courseId: idQuery,
	seriesId: idQuery,
});

export const estimates = new Hono<Env>().get("/reference", validate("query", referenceQuerySchema), async (c) => {
	const { category, courseId, seriesId } = c.req.valid("query");
	const result = await computeReference(getDb(c.env), {
		category,
		courseId: courseId ?? null,
		seriesId: seriesId ?? null,
	});
	return c.json(result, 200);
});
