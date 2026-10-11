import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { runScheduled } from "./cron";
import type { Bindings, Env } from "./env";
import { busyBlocks } from "./routes/busy-blocks";
import { courses } from "./routes/courses";
import { health } from "./routes/health";
import { inbox } from "./routes/inbox";
import { ingest } from "./routes/ingest";
import { parse } from "./routes/parse";
import { push } from "./routes/push";
import { review } from "./routes/review";
import { schedule } from "./routes/schedule";
import { sessions } from "./routes/sessions";
import { settings } from "./routes/settings";
import { status } from "./routes/status";
import { tasks } from "./routes/tasks";
import { webhooks } from "./routes/webhooks";

const app = new Hono<Env>().basePath("/api");

const routes = app
	.route("/health", health)
	.route("/tasks", tasks)
	.route("/courses", courses)
	.route("/busy-blocks", busyBlocks)
	.route("/settings", settings)
	.route("/push", push)
	.route("/parse", parse)
	.route("/schedule", schedule)
	.route("/status", status)
	.route("/sessions", sessions)
	.route("/webhooks", webhooks)
	.route("/ingest", ingest)
	.route("/inbox", inbox)
	.route("/review", review);

app.notFound((c) => c.json({ error: "not_found" }, 404));
// 想定外の例外は 500 internal。中身は返さずログにだけ残す。
// Hono が投げる HTTPException は状態コードを保つ(400 は壊れた JSON・FormData なので入力の誤り)
app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json({ error: err.status === 400 ? "invalid_input" : "http_error", message: err.message }, err.status);
	}
	console.error(err);
	return c.json({ error: "internal" }, 500);
});

export type AppType = typeof routes;

export default {
	fetch: app.fetch,
	scheduled: (event, env, ctx) => runScheduled(event, env, ctx),
} satisfies ExportedHandler<Bindings>;
