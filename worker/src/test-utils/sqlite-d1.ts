/// <reference types="node" />
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL } from "node:url";
import { getDb } from "../db";

export const MIGRATIONS = [
	"0000_init.sql",
	"0001_push_tokens_platform.sql",
	"0002_recurrence.sql",
	"0003_courses_from_classes.sql",
	"0004_unify_task_completion.sql",
	"0005_completion_notify.sql",
	"0006_zero_work_items.sql",
	"0007_repair_completed_work.sql",
];
export const migration = (file: string) => readFileSync(new URL(`../../migrations/${file}`, import.meta.url), "utf8");
export const NOW = Date.UTC(2026, 10, 11, 12);

/** Actual SQLite with the small D1 interface used by Drizzle. No Workers or external services. */
export class LocalD1 {
	readonly sqlite = new DatabaseSync(":memory:");
	readonly batches: string[][] = [];
	private pause: { entered: () => void; released: Promise<void> } | undefined;

	constructor(files = MIGRATIONS) {
		for (const file of files) this.sqlite.exec(migration(file));
	}

	prepare(query: string) {
		const statement = this.sqlite.prepare(query);
		let params: SQLInputValue[] = [];
		return {
			query,
			bind(...values: SQLInputValue[]) {
				if (values.length > 100) throw new Error(`D1 bind limit exceeded: ${values.length}`);
				params = values;
				return this;
			},
			async raw() {
				statement.setReturnArrays(true);
				return statement.all(...params);
			},
			async all() {
				statement.setReturnArrays(false);
				return { success: true, results: statement.all(...params) };
			},
			async run() {
				return { success: true, results: [], meta: statement.run(...params) };
			},
		};
	}

	pauseNextBatch() {
		const { promise: entered, resolve: enter } = Promise.withResolvers<void>();
		const { promise: released, resolve: release } = Promise.withResolvers<void>();
		this.pause = { entered: enter, released };
		return { entered, release };
	}

	async batch(statements: ReturnType<LocalD1["prepare"]>[]) {
		if (this.pause) {
			const pause = this.pause;
			this.pause = undefined;
			pause.entered();
			await pause.released;
		}
		this.batches.push(statements.map((s) => s.query));
		this.sqlite.exec("BEGIN");
		try {
			const results = [];
			for (const statement of statements) results.push(await statement.all());
			this.sqlite.exec("COMMIT");
			return results;
		} catch (error) {
			this.sqlite.exec("ROLLBACK");
			throw error;
		}
	}

	get env() {
		return { DB: this as unknown as D1Database } as CloudflareBindings;
	}

	get db() {
		return getDb(this.env);
	}

	seedTask(id = "t", status = "doing", updatedAt = NOW) {
		this.sqlite
			.prepare(
				"INSERT INTO tasks(id,title,due_at,estimate_min,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
			)
			.run(id, "課題", NOW + 86_400_000, 60, status, NOW - 86_400_000, updatedAt);
	}

	seedWork(taskId = "t", startAt = NOW - 3_600_000) {
		this.sqlite
			.prepare("INSERT INTO sessions(id,task_id,kind,start_at,end_at) VALUES(?,?,?,?,null)")
			.run(`s-${taskId}`, taskId, "actual", startAt);
		this.sqlite.prepare("INSERT INTO user_status(id,mode,task_id) VALUES(1,'working',?)").run(taskId);
	}
}

export const createTestDb = (files?: string[]) => new LocalD1(files);
