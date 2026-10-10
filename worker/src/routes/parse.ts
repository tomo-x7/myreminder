import { vValidator } from "@hono/valibot-validator";
import { Hono } from "hono";
import * as v from "valibot";
import { loadParseContext, parseTasks } from "../ai/parse";
import { getDb } from "../db";
import type { Env } from "../env";

const text = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const lineSchema = v.object({ text: text(500) });
const pasteSchema = v.object({ text: text(8000) });

// AI の失敗(無料枠切れ・出力が壊れた等)は HTTP 200 + { candidates: [], error } で返す。
// 画面は candidates が空なら error を見せて、手入力のカードに切り替える
export const parse = new Hono<Env>()
	.post("/line", vValidator("json", lineSchema), async (c) => {
		const { text } = c.req.valid("json");
		const ctx = await loadParseContext(getDb(c.env));
		return c.json(await parseTasks(c.env, { text, mode: "line" }, ctx), 200);
	})
	.post("/text", vValidator("json", pasteSchema), async (c) => {
		const { text } = c.req.valid("json");
		const ctx = await loadParseContext(getDb(c.env));
		return c.json(await parseTasks(c.env, { text, mode: "text" }, ctx), 200);
	});
