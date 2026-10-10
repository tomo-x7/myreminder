import { vValidator } from "@hono/valibot-validator";
import { Hono } from "hono";
import * as v from "valibot";
import { getDb } from "../db";
import type { Env } from "../env";
import { computePlan, computeSlackList } from "../services/planning";

const slackQuerySchema = v.object({
	// 空き時間の長さ(分)。省略すると次の空き時間の長さ(30〜90)
	spareMin: v.optional(v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(30), v.maxValue(180))),
});

export const schedule = new Hono<Env>()
	.get("/", async (c) => c.json(await computePlan(getDb(c.env), Date.now()), 200))
	.get("/slack", vValidator("query", slackQuerySchema), async (c) =>
		c.json(await computeSlackList(getDb(c.env), Date.now(), c.req.valid("query").spareMin), 200),
	);
