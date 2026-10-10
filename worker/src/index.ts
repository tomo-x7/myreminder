import { Hono } from "hono";
import { health } from "./routes/health";

const app = new Hono<{ Bindings: CloudflareBindings }>().basePath("/api");

const routes = app.route("/health", health);

app.notFound((c) => c.json({ error: "not_found" }, 404));

export type AppType = typeof routes;

export default {
	fetch: app.fetch,
	scheduled: async (_event, _env, _ctx) => {
		// TODO: 毎分の処理(通知送信・再計画・ダイジェスト)は issue #8 で実装する
	},
} satisfies ExportedHandler<CloudflareBindings>;
