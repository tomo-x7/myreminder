CREATE TABLE `task_series` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`course_id` text,
	`category` text DEFAULT 'other' NOT NULL,
	`estimate_min` integer NOT NULL,
	`estimate_source` text DEFAULT 'manual' NOT NULL,
	`min_block_min` integer DEFAULT 30 NOT NULL,
	`first_step` text,
	`note` text,
	`freq` text NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`anchor_due_at` integer NOT NULL,
	`release_offset_min` integer,
	`planned_start_offset_min` integer,
	`count` integer,
	`until` integer,
	`materialized_count` integer DEFAULT 0 NOT NULL,
	`stopped_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `series_id` text REFERENCES `task_series`(`id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `tasks` ADD `series_index` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_series_id_index_uq` ON `tasks` (`series_id`,`series_index`);