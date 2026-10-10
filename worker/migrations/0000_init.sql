CREATE TABLE `ai_log` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`input_text` text NOT NULL,
	`output_json` text,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `busy_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`weekday` integer,
	`start_min` integer,
	`end_min` integer,
	`start_at` integer,
	`end_at` integer,
	`date_from` integer,
	`date_to` integer,
	`label` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`color` text
);
--> statement-breakpoint
CREATE TABLE `ingest_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`course_name` text,
	`due_at` integer,
	`url` text,
	`remote_state` text,
	`payload_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`task_id` text,
	`pending_change_json` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingest_items_source_external_id_uq` ON `ingest_items` (`source`,`external_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`kind` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`scheduled_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_status_scheduled_at_idx` ON `notifications` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `notifications_task_id_idx` ON `notifications` (`task_id`);--> statement-breakpoint
CREATE TABLE `push_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`kind` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`progress` integer,
	`review` text DEFAULT 'confirmed' NOT NULL,
	`edited` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_task_id_idx` ON `sessions` (`task_id`);--> statement-breakpoint
CREATE INDEX `sessions_start_at_idx` ON `sessions` (`start_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_due_history` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`old_due_at` integer NOT NULL,
	`new_due_at` integer NOT NULL,
	`changed_at` integer NOT NULL,
	`cause` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_due_history_task_id_idx` ON `task_due_history` (`task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text,
	`title` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`due_at` integer NOT NULL,
	`release_at` integer,
	`estimate_min` integer NOT NULL,
	`estimate_source` text DEFAULT 'manual' NOT NULL,
	`min_block_min` integer DEFAULT 30 NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`planned_start_at` integer,
	`first_step` text,
	`note` text,
	`submitted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_status_due_at_idx` ON `tasks` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_course_id_idx` ON `tasks` (`course_id`);--> statement-breakpoint
CREATE TABLE `user_status` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'normal' NOT NULL,
	`task_id` text,
	`until` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "user_status_singleton" CHECK("user_status"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`events` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_error` text
);
