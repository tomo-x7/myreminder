import { eq } from "drizzle-orm";
import { Hono } from "hono";
import * as v from "valibot";
import { getDb } from "../db";
import { notifications, PUSH_PLATFORMS, pushTokens } from "../db/schema";
import type { Env } from "../env";
import { dispatchDueNotifications } from "../notify/dispatch";
import { validate } from "../services/validate";

const tokenBodySchema = v.object({
	// FID または登録トークン
	token: v.pipe(v.string(), v.minLength(10), v.maxLength(4096)),
	label: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
	// 省略は web(新規登録のとき DB の既定値)。既存の web クライアントは送らない
	platform: v.optional(v.picklist(PUSH_PLATFORMS)),
});

const tokenParamSchema = v.object({ token: v.pipe(v.string(), v.minLength(1)) });

const testBodySchema = v.object({
	title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))),
	body: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

export const push = new Hono<Env>()
	// 端末の登録(upsert)。アプリを開くたびに呼ばれ、last_seen_at を更新する
	.post("/tokens", validate("json", tokenBodySchema), async (c) => {
		const { token, label, platform } = c.req.valid("json");
		const now = Date.now();
		await getDb(c.env)
			.insert(pushTokens)
			.values({ token, label, platform, createdAt: now, lastSeenAt: now })
			.onConflictDoUpdate({
				target: pushTokens.token,
				// label・platform は渡されたときだけ上書きする
				set: {
					lastSeenAt: now,
					...(label !== undefined ? { label } : {}),
					...(platform !== undefined ? { platform } : {}),
				},
			});
		return c.json({ ok: true as const }, 200);
	})
	.delete("/tokens/:token", validate("param", tokenParamSchema), async (c) => {
		const { token } = c.req.valid("param");
		await getDb(c.env).delete(pushTokens).where(eq(pushTokens.token, token));
		return c.json({ ok: true as const }, 200);
	})
	// テスト送信。cron を待たずその場で送り、宛先ごとの結果を返す
	.post("/test", validate("json", testBodySchema), async (c) => {
		const { title, body } = c.req.valid("json");
		const now = Date.now();
		const db = getDb(c.env);
		const [row] = await db
			.insert(notifications)
			.values({
				kind: "start",
				scheduledAt: now,
				payload: { title: title ?? "テスト通知", body: body ?? "myreminder からのテスト送信です", url: "/" },
			})
			.returning({ id: notifications.id });

		const summary = await dispatchDueNotifications(c.env, now, { onlyIds: [row.id] });
		if (!summary.configured) {
			// 設定前のテスト行は後で送られないよう片付ける
			await db.update(notifications).set({ status: "skipped" }).where(eq(notifications.id, row.id));
		}
		const sent = summary.notifications.find((n) => n.id === row.id);
		return c.json(
			{
				ok: !!sent?.results.some((r) => r.ok),
				configured: summary.configured,
				notificationId: row.id,
				// 全文は返さず末尾だけ
				results: (sent?.results ?? []).map((r) => ({ ...r, token: `…${r.token.slice(-6)}` })),
			},
			200,
		);
	});
