import { Hono } from "hono";
import { runScheduled } from "./cron";
import type { Bindings, Env } from "./env";
import { busyBlocks } from "./routes/busy-blocks";
import { courses } from "./routes/courses";
import { health } from "./routes/health";
import { parse } from "./routes/parse";
import { push } from "./routes/push";
import { settings } from "./routes/settings";
import { tasks } from "./routes/tasks";

const app = new Hono<Env>().basePath("/api");

const routes = app
	.route("/health", health)
	.route("/tasks", tasks)
	.route("/courses", courses)
	.route("/busy-blocks", busyBlocks)
	.route("/settings", settings)
	.route("/push", push)
	.route("/parse", parse);

app.notFound((c) => c.json({ error: "not_found" }, 404));

export type AppType = typeof routes;

export default {
	fetch: app.fetch,
	scheduled: (event, env, ctx) => runScheduled(event, env, ctx),
} satisfies ExportedHandler<Bindings>;
