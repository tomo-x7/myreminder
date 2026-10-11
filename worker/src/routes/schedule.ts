import { Hono } from "hono";
import * as v from "valibot";
import { loadParseContext } from "../ai/parse";
import { computeStartSuggestions } from "../ai/suggest";
import { getDb } from "../db";
import type { Env } from "../env";
import { idParamSchema, NOT_FOUND } from "../services/http";
import { computePlan, computeSlackList, computeWhatIf } from "../services/planning";
import { validate } from "../services/validate";

const slackQuerySchema = v.object({
	// 空き時間の長さ(分)。省略すると次の空き時間の長さ(30〜90)
	spareMin: v.optional(v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.minValue(30), v.maxValue(180))),
});

const whatIfQuerySchema = v.object({
	startAt: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number)),
});

export const schedule = new Hono<Env>()
	.get("/", async (c) => c.json(await computePlan(getDb(c.env), Date.now()), 200))
	// 「いつに回す?」: そのタスクを startAt より前には着手しないとしたときの、計画の変化
	.get("/what-if/:id", validate("param", idParamSchema), validate("query", whatIfQuerySchema), async (c) => {
		const result = await computeWhatIf(
			getDb(c.env),
			Date.now(),
			c.req.valid("param").id,
			c.req.valid("query").startAt,
		);
		return result ? c.json(result, 200) : c.json(NOT_FOUND, 404);
	})
	// 手入力のカードの「いつ始める?」の候補。AI の解析なしで(parse の応答と同じ形で)返す
	.get("/start-suggestions", async (c) => {
		const now = Date.now();
		const ctx = await loadParseContext(getDb(c.env));
		return c.json(
			{ startSuggestions: computeStartSuggestions({ now, busy: ctx.busy, sleep: ctx.sleep }), now },
			200,
		);
	})
	.get("/slack", validate("query", slackQuerySchema), async (c) =>
		c.json(await computeSlackList(getDb(c.env), Date.now(), c.req.valid("query").spareMin), 200),
	);
