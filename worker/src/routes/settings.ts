import { vValidator } from "@hono/valibot-validator";
import { Hono } from "hono";
import { getDb } from "../db";
import type { Env } from "../env";
import { settingsUpdateSchema } from "../schemas/settings";
import { getSettings, updateSettings } from "../settings";

export const settings = new Hono<Env>()
	.get("/", async (c) => c.json(await getSettings(getDb(c.env)), 200))
	.patch("/", vValidator("json", settingsUpdateSchema), async (c) =>
		c.json(await updateSettings(getDb(c.env), c.req.valid("json")), 200),
	);
