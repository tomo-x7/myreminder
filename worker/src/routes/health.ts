import { Hono } from "hono";

export const health = new Hono<{ Bindings: CloudflareBindings }>().get("/", (c) =>
	c.json({ ok: true, now: Date.now() }),
);
