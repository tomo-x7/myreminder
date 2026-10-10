import { vValidator } from "@hono/valibot-validator";
import { Hono } from "hono";
import { getDb } from "../db";
import type { Env } from "../env";
import { triggerReplan } from "../notify/replan";
import { settingsUpdateSchema } from "../schemas/settings";
import { getSettings, updateSettings } from "../settings";

export const settings = new Hono<Env>()
	.get("/", async (c) => c.json(await getSettings(getDb(c.env)), 200))
	.patch("/", vValidator("json", settingsUpdateSchema), async (c) => {
		const result = await updateSettings(getDb(c.env), c.req.valid("json"));
		triggerReplan(c);
		return c.json(result, 200);
	});
