// 仕様: ai-docs/plan.md §4.7
// 時刻はすべて epoch ミリ秒の integer。id は text(UUID)で、アプリ側で採番する
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () =>
	text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

export const TASK_CATEGORIES = ["report", "exercise", "quiz", "presentation", "other"] as const;
export const TASK_STATUSES = ["todo", "doing", "done", "submitted", "dismissed"] as const;
export const ESTIMATE_SOURCES = ["ai", "manual"] as const;
export const SESSION_KINDS = ["planned", "actual"] as const;
export const SESSION_REVIEWS = ["confirmed", "needs_review"] as const;
export const BUSY_KINDS = ["class", "job", "event"] as const;
export const INGEST_STATUSES = ["pending", "linked", "ignored"] as const;
export const USER_MODES = ["normal", "working", "busy", "sleep"] as const;
export const NOTIFICATION_KINDS = [
	"digest",
	"start",
	"risk",
	"critical",
	"due_change",
	"submit_check",
	"evening",
	"weekly",
	"inbox",
] as const;
export const NOTIFICATION_STATUSES = ["pending", "sent", "deferred", "merged", "skipped"] as const;
export const PUSH_PLATFORMS = ["web", "android"] as const;
export const WEBHOOK_KINDS = ["discord", "slack"] as const;
export const WEBHOOK_EVENTS = ["submitted", "daily_summary", "all_notifications"] as const;
export const AI_LOG_STATUSES = ["ok", "error"] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type UserMode = (typeof USER_MODES)[number];
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const courses = sqliteTable("courses", {
	id: id(),
	name: text("name").notNull(),
	// 取り込み元ごとの表記揺れ
	aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
	color: text("color"),
});

export const tasks = sqliteTable(
	"tasks",
	{
		id: id(),
		courseId: text("course_id").references(() => courses.id, { onDelete: "set null" }),
		title: text("title").notNull(),
		category: text("category", { enum: TASK_CATEGORIES }).notNull().default("other"),
		dueAt: integer("due_at").notNull(),
		// これより前は着手できない
		releaseAt: integer("release_at"),
		estimateMin: integer("estimate_min").notNull(),
		estimateSource: text("estimate_source", { enum: ESTIMATE_SOURCES }).notNull().default("manual"),
		minBlockMin: integer("min_block_min").notNull().default(30),
		status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
		// 本人が決めた着手時刻
		plannedStartAt: integer("planned_start_at"),
		firstStep: text("first_step"),
		note: text("note"),
		submittedAt: integer("submitted_at"),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(t) => [index("tasks_status_due_at_idx").on(t.status, t.dueAt), index("tasks_course_id_idx").on(t.courseId)],
);

export const taskDueHistory = sqliteTable(
	"task_due_history",
	{
		id: id(),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		oldDueAt: integer("old_due_at").notNull(),
		newDueAt: integer("new_due_at").notNull(),
		changedAt: integer("changed_at").notNull(),
		cause: text("cause", { enum: ["manual", "ingest"] }).notNull(),
	},
	(t) => [index("task_due_history_task_id_idx").on(t.taskId)],
);

export const sessions = sqliteTable(
	"sessions",
	{
		id: id(),
		taskId: text("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: SESSION_KINDS }).notNull(),
		startAt: integer("start_at").notNull(),
		// 作業中(未終了)は null
		endAt: integer("end_at"),
		progress: integer("progress"),
		// 消し忘れの確認待ちは needs_review。確定するまで学習に使わない
		review: text("review", { enum: SESSION_REVIEWS }).notNull().default("confirmed"),
		// 手で直したか
		edited: integer("edited", { mode: "boolean" }).notNull().default(false),
	},
	(t) => [index("sessions_task_id_idx").on(t.taskId), index("sessions_start_at_idx").on(t.startAt)],
);

// 繰り返し(時間割・バイト)は weekday + startMin/endMin(JST 0時からの分)+ 期間。
// 単発の予定は startAt/endAt(epoch ms)
export const busyBlocks = sqliteTable("busy_blocks", {
	id: id(),
	kind: text("kind", { enum: BUSY_KINDS }).notNull(),
	// 0=日 〜 6=土(JST)
	weekday: integer("weekday"),
	startMin: integer("start_min"),
	endMin: integer("end_min"),
	startAt: integer("start_at"),
	endAt: integer("end_at"),
	dateFrom: integer("date_from"),
	dateTo: integer("date_to"),
	label: text("label").notNull().default(""),
});

export const ingestItems = sqliteTable(
	"ingest_items",
	{
		id: id(),
		source: text("source").notNull(),
		externalId: text("external_id").notNull(),
		title: text("title").notNull(),
		courseName: text("course_name"),
		dueAt: integer("due_at"),
		url: text("url"),
		// 提出状態など
		remoteState: text("remote_state"),
		payload: text("payload_json", { mode: "json" }).$type<unknown>(),
		status: text("status", { enum: INGEST_STATUSES }).notNull().default("pending"),
		taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
		pendingChange: text("pending_change_json", { mode: "json" }).$type<unknown>(),
		firstSeenAt: integer("first_seen_at").notNull(),
		lastSeenAt: integer("last_seen_at").notNull(),
	},
	(t) => [uniqueIndex("ingest_items_source_external_id_uq").on(t.source, t.externalId)],
);

// 1行のみ(id = 1)
export const userStatus = sqliteTable(
	"user_status",
	{
		id: integer("id").primaryKey(),
		mode: text("mode", { enum: USER_MODES }).notNull().default("normal"),
		taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
		// 期限なしは null
		until: integer("until"),
	},
	(t) => [check("user_status_singleton", sql`${t.id} = 1`)],
);

export const notifications = sqliteTable(
	"notifications",
	{
		id: id(),
		taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
		priority: integer("priority").notNull().default(0),
		scheduledAt: integer("scheduled_at").notNull(),
		status: text("status", { enum: NOTIFICATION_STATUSES }).notNull().default("pending"),
		payload: text("payload", { mode: "json" }).$type<unknown>(),
	},
	(t) => [
		index("notifications_status_scheduled_at_idx").on(t.status, t.scheduledAt),
		index("notifications_task_id_idx").on(t.taskId),
	],
);

export const pushTokens = sqliteTable("push_tokens", {
	token: text("token").primaryKey(),
	label: text("label"),
	// 登録元。web は FID、android は FCM の登録トークン
	platform: text("platform", { enum: PUSH_PLATFORMS }).notNull().default("web"),
	createdAt: integer("created_at").notNull(),
	lastSeenAt: integer("last_seen_at").notNull(),
});

export const webhooks = sqliteTable("webhooks", {
	id: id(),
	kind: text("kind", { enum: WEBHOOK_KINDS }).notNull(),
	// 秘密情報。API では返さない
	url: text("url").notNull(),
	events: text("events", { mode: "json" }).$type<WebhookEvent[]>().notNull().default(sql`'[]'`),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	lastError: text("last_error"),
});

export const aiLog = sqliteTable("ai_log", {
	id: id(),
	purpose: text("purpose").notNull(),
	inputText: text("input_text").notNull(),
	output: text("output_json", { mode: "json" }).$type<unknown>(),
	model: text("model").notNull(),
	status: text("status", { enum: AI_LOG_STATUSES }).notNull(),
	error: text("error"),
	createdAt: integer("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value", { mode: "json" }).$type<unknown>().notNull(),
});
