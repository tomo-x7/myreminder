import { vValidator } from "@hono/valibot-validator";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { webhooks as webhooksTable } from "../db/schema";
import type { Env } from "../env";
import { sendWebhook } from "../notify/webhook";
import { isValidWebhookUrl, maskWebhookUrl, webhookCreateSchema, webhookUpdateSchema } from "../schemas/webhook";
import { idParamSchema, NOT_FOUND } from "../services/http";

type WebhookRow = typeof webhooksTable.$inferSelect;

/** URL は秘密情報。API には出さず、マスクした形だけ返す */
const toPublic = ({ url, ...rest }: WebhookRow) => ({ ...rest, maskedUrl: maskWebhookUrl(url) });

// 検証エラーに入力(URL)をそのまま返さない
const rejectInvalid: Parameters<typeof vValidator>[2] = (result, c) => {
	if (!result.success) {
		const issues = result.issues.map((i) => `${i.path?.map((p) => String(p.key)).join(".") ?? ""}: ${i.message}`);
		return c.json({ error: "invalid_webhook", issues }, 400);
	}
};

export const webhooks = new Hono<Env>()
	.get("/", async (c) => {
		const rows = await getDb(c.env).select().from(webhooksTable).orderBy(asc(webhooksTable.id));
		return c.json(rows.map(toPublic), 200);
	})
	.post("/", vValidator("json", webhookCreateSchema, rejectInvalid), async (c) => {
		const [row] = await getDb(c.env).insert(webhooksTable).values(c.req.valid("json")).returning();
		return c.json(toPublic(row), 201);
	})
	.patch(
		"/:id",
		vValidator("param", idParamSchema),
		vValidator("json", webhookUpdateSchema, rejectInvalid),
		async (c) => {
			const { id } = c.req.valid("param");
			const body = c.req.valid("json");
			const db = getDb(c.env);
			const [current] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
			if (!current) return c.json(NOT_FOUND, 404);
			if (body.url !== undefined && !isValidWebhookUrl(current.kind, body.url)) {
				return c.json({ error: "invalid_webhook_url" }, 400);
			}
			// URL を差し替えたら、前の URL のエラーは消す
			const set = body.url === undefined ? body : { ...body, lastError: null };
			if (Object.keys(set).length === 0) return c.json(toPublic(current), 200);
			const [row] = await db.update(webhooksTable).set(set).where(eq(webhooksTable.id, id)).returning();
			return c.json(toPublic(row), 200);
		},
	)
	.delete("/:id", vValidator("param", idParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const [row] = await getDb(c.env)
			.delete(webhooksTable)
			.where(eq(webhooksTable.id, id))
			.returning({ id: webhooksTable.id });
		return row ? c.json({ ok: true as const }, 200) : c.json(NOT_FOUND, 404);
	})
	.post("/:id/test", vValidator("param", idParamSchema), async (c) => {
		const { id } = c.req.valid("param");
		const db = getDb(c.env);
		const [row] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
		if (!row) return c.json(NOT_FOUND, 404);
		const result = await sendWebhook(row.kind, row.url, "myreminder からのテスト送信です");
		await db
			.update(webhooksTable)
			.set({ lastError: result.ok ? null : (result.error ?? "unknown_error") })
			.where(eq(webhooksTable.id, id));
		return c.json(result, 200);
	});
