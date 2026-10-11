import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import * as v from "valibot";
import { loadParseContext, parseTasks } from "../ai/parse";
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES, parseImage } from "../ai/parse-image";
import { getDb } from "../db";
import type { Env } from "../env";
import { validate } from "../services/validate";

const text = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const lineSchema = v.object({ text: text(500) });
const pasteSchema = v.object({ text: text(8000) });
const imageSchema = v.object({ image: v.instance(File) });

const TOO_LARGE = { error: "too_large", message: "画像は 1.5MB まで" } as const;

// multipart の枠(境界・ヘッダー)の分だけ、画像の上限より少し広く取る
const BODY_LIMIT_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

// AI の失敗(無料枠切れ・出力が壊れた等)は HTTP 200 + { candidates: [], error } で返す。
// 画面は candidates が空なら error を見せて、手入力のカードに切り替える
export const parse = new Hono<Env>()
	.post("/line", validate("json", lineSchema), async (c) => {
		const { text } = c.req.valid("json");
		const ctx = await loadParseContext(getDb(c.env));
		return c.json(await parseTasks(c.env, { text, mode: "line" }, ctx), 200);
	})
	.post("/text", validate("json", pasteSchema), async (c) => {
		const { text } = c.req.valid("json");
		const ctx = await loadParseContext(getDb(c.env));
		return c.json(await parseTasks(c.env, { text, mode: "text" }, ctx), 200);
	})
	// 講義スライドの写真。multipart の `image` フィールドに1枚。上限を超えたら 413、画像以外は 415
	.post(
		"/image",
		bodyLimit({
			maxSize: BODY_LIMIT_BYTES,
			onError: (c) => c.json(TOO_LARGE, 413),
		}),
		validate("form", imageSchema),
		async (c) => {
			const { image } = c.req.valid("form");
			if (image.size > MAX_IMAGE_BYTES) return c.json(TOO_LARGE, 413);
			if (!(IMAGE_MIME_TYPES as readonly string[]).includes(image.type)) {
				return c.json({ error: "unsupported_media_type" as const, message: "JPEG・PNG・WebP のみ" }, 415);
			}
			const ctx = await loadParseContext(getDb(c.env));
			const bytes = new Uint8Array(await image.arrayBuffer());
			return c.json(await parseImage(c.env, { bytes, mime: image.type }, ctx), 200);
		},
	);
