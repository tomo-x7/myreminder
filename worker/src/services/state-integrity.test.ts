import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../db";
import { clearNoteReminders } from "../notify/note-reminders";
import { triggerReplan } from "../notify/replan";
import { notifySubmitted } from "../notify/webhook";
import { tasks as taskRoutes } from "../routes/tasks";
import { type ExistingItem, planIngest } from "./ingest";
import { applyIngestPlan } from "./ingest-write";
import { startWorking } from "./status";

vi.mock("../notify/replan", () => ({ triggerReplan: vi.fn() }));
vi.mock("../notify/webhook", () => ({ notifySubmitted: vi.fn(async () => {}) }));
vi.mock("../notify/note-reminders", () => ({ clearNoteReminders: vi.fn(async () => {}) }));

import { LocalD1, MIGRATIONS, migration, NOW } from "../test-utils/sqlite-d1";

const databases: LocalD1[] = [];
const localDb = (files?: string[]) => {
	const db = new LocalD1(files);
	databases.push(db);
	return db;
};
const patchTask = (db: LocalD1, body: object) =>
	taskRoutes.request(
		"http://local/t",
		{ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
		db.env,
		{ waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext,
	);
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
	vi.restoreAllMocks();
	for (const db of databases.splice(0)) db.sqlite.close();
});

describe("課題更新と完了のDB整合性", () => {
	it("未完了課題の開始では前の作業を閉じ、新しい課題へ切り替える", async () => {
		const db = localDb();
		db.seedTask("t", "todo");
		db.seedTask("other", "doing");
		db.seedWork("other");
		expect((await startWorking(db.db, "t", NOW)).ok).toBe(true);
		expect(db.sqlite.prepare("SELECT end_at FROM sessions WHERE task_id='other'").get()).toMatchObject({
			end_at: NOW,
		});
		expect(db.sqlite.prepare("SELECT end_at,kind FROM sessions WHERE task_id='t'").get()).toMatchObject({
			end_at: null,
			kind: "actual",
		});
		expect(db.sqlite.prepare("SELECT mode,task_id FROM user_status").get()).toMatchObject({
			mode: "working",
			task_id: "t",
		});
		expect(db.sqlite.prepare("SELECT status FROM tasks WHERE id='t'").get()).toMatchObject({ status: "doing" });
	});

	it.each([{ status: "done" }, { taskKind: "note" }])(
		"作業開始と競合した閉鎖 %j は、新しい実績も別課題の作業終了も作らない",
		async (closedPatch) => {
			const db = localDb();
			db.seedTask("t", "todo");
			db.seedTask("other", "doing");
			db.seedWork("other");
			const paused = db.pauseNextBatch();
			const started = startWorking(db.db, "t", NOW);
			await paused.entered;
			try {
				expect((await patchTask(db, closedPatch)).status).toBe(200);
			} finally {
				paused.release();
			}
			expect(await started).toEqual({ ok: false, error: "task_closed" });
			expect(db.sqlite.prepare("SELECT count(*) AS n FROM sessions WHERE task_id='t'").get()).toMatchObject({
				n: 0,
			});
			expect(db.sqlite.prepare("SELECT end_at FROM sessions WHERE task_id='other'").get()).toMatchObject({
				end_at: null,
			});
			expect(db.sqlite.prepare("SELECT mode,task_id FROM user_status").get()).toMatchObject({
				mode: "working",
				task_id: "other",
			});
		},
	);

	it("メモ変換より先に作業を開始したら、古い変換は作業中のメモを保存しない", async () => {
		const db = localDb();
		db.seedTask("t", "todo");
		const paused = db.pauseNextBatch();
		const conversion = patchTask(db, { taskKind: "note" });
		await paused.entered;
		let sessionId: string | undefined;
		try {
			const started = await startWorking(db.db, "t", NOW);
			expect(started.ok).toBe(true);
			if (started.ok) sessionId = started.sessionId;
		} finally {
			paused.release();
		}
		expect((await conversion).status).toBe(409);
		expect(db.sqlite.prepare("SELECT task_kind,status,estimate_min FROM tasks WHERE id='t'").get()).toMatchObject({
			task_kind: "work",
			status: "doing",
			estimate_min: 60,
		});
		expect(db.sqlite.prepare("SELECT end_at FROM sessions WHERE id=?").get(sessionId ?? "")).toMatchObject({
			end_at: null,
		});
		expect(db.sqlite.prepare("SELECT mode,task_id FROM user_status").get()).toMatchObject({
			mode: "working",
			task_id: "t",
		});
		expect(clearNoteReminders).not.toHaveBeenCalled();
		expect(triggerReplan).not.toHaveBeenCalled();
	});

	it("同時の完了要求は1件だけ保存し、通知も1回だけ送る", async () => {
		const db = localDb();
		db.seedTask();
		db.seedWork();
		const paused = db.pauseNextBatch();
		const first = patchTask(db, { status: "done" });
		await paused.entered;
		try {
			expect((await patchTask(db, { status: "done" })).status).toBe(200);
		} finally {
			paused.release();
		}
		expect((await first).status).toBe(409);
		expect(notifySubmitted).toHaveBeenCalledTimes(1);
		expect(triggerReplan).toHaveBeenCalledTimes(1);
	});

	it("メモへの変換と競合した古い見積もり変更は0分制約を壊さない", async () => {
		const db = localDb();
		db.seedTask();
		const paused = db.pauseNextBatch();
		const estimateRequest = patchTask(db, { estimateMin: 120 });
		await paused.entered;
		try {
			expect((await patchTask(db, { taskKind: "note" })).status).toBe(200);
		} finally {
			paused.release();
		}
		const stale = await estimateRequest;
		expect(stale.status).toBe(409);
		expect(await stale.json()).toEqual({ error: "task_changed" });
		expect(db.sqlite.prepare("SELECT task_kind,estimate_min FROM tasks WHERE id='t'").get()).toMatchObject({
			task_kind: "note",
			estimate_min: 0,
		});
		expect(clearNoteReminders).toHaveBeenCalledTimes(1);
		expect(triggerReplan).toHaveBeenCalledTimes(1);
	});

	it("古い完了と締切変更が競合で失敗しても、再開した作業と締切履歴に副作用を残さない", async () => {
		const db = localDb();
		db.seedTask("t", "todo");
		const paused = db.pauseNextBatch();
		const staleCompletion = patchTask(db, { status: "done", dueAt: NOW + 172_800_000 });
		await paused.entered;
		let sessionId: string | undefined;
		try {
			expect((await patchTask(db, { status: "done" })).status).toBe(200);
			expect((await patchTask(db, { status: "todo" })).status).toBe(200);
			const started = await startWorking(db.db, "t", NOW + 1_000);
			expect(started.ok).toBe(true);
			if (started.ok) sessionId = started.sessionId;
		} finally {
			paused.release();
		}
		expect((await staleCompletion).status).toBe(409);
		expect(db.sqlite.prepare("SELECT status,due_at FROM tasks WHERE id='t'").get()).toMatchObject({
			status: "doing",
			due_at: NOW + 86_400_000,
		});
		expect(db.sqlite.prepare("SELECT end_at FROM sessions WHERE id=?").get(sessionId ?? "")).toMatchObject({
			end_at: null,
		});
		expect(db.sqlite.prepare("SELECT mode,task_id FROM user_status").get()).toMatchObject({
			mode: "working",
			task_id: "t",
		});
		expect(db.sqlite.prepare("SELECT count(*) AS n FROM task_due_history").get()).toMatchObject({ n: 0 });
		expect(notifySubmitted).toHaveBeenCalledTimes(1);
		expect(triggerReplan).toHaveBeenCalledTimes(2);
	});

	it("同時の締切変更は競合を返し、保存された変更の履歴だけ残す", async () => {
		const db = localDb();
		db.seedTask();
		const paused = db.pauseNextBatch();
		const staleDue = patchTask(db, { dueAt: NOW + 172_800_000 });
		await paused.entered;
		try {
			expect((await patchTask(db, { dueAt: NOW + 259_200_000 })).status).toBe(200);
		} finally {
			paused.release();
		}
		expect((await staleDue).status).toBe(409);
		expect(db.sqlite.prepare("SELECT old_due_at,new_due_at FROM task_due_history").all()).toEqual([
			expect.objectContaining({ old_due_at: NOW + 86_400_000, new_due_at: NOW + 259_200_000 }),
		]);
	});

	it("同じ時計で完了からdoingへ戻っても、古いdoingの完了要求で新しい作業を閉じない", async () => {
		vi.spyOn(Date, "now").mockReturnValue(NOW);
		const db = localDb();
		db.seedTask();
		const paused = db.pauseNextBatch();
		const staleCompletion = patchTask(db, { status: "done" });
		await paused.entered;
		let sessionId: string | undefined;
		try {
			expect((await patchTask(db, { status: "done" })).status).toBe(200);
			expect((await patchTask(db, { status: "todo" })).status).toBe(200);
			const started = await startWorking(db.db, "t", NOW);
			expect(started.ok).toBe(true);
			if (started.ok) sessionId = started.sessionId;
		} finally {
			paused.release();
		}
		expect((await staleCompletion).status).toBe(409);
		expect(db.sqlite.prepare("SELECT status,updated_at FROM tasks WHERE id='t'").get()).toMatchObject({
			status: "doing",
			updated_at: NOW + 3,
		});
		expect(db.sqlite.prepare("SELECT end_at FROM sessions WHERE id=?").get(sessionId ?? "")).toMatchObject({
			end_at: null,
		});
		expect(db.sqlite.prepare("SELECT mode FROM user_status").get()).toMatchObject({ mode: "working" });
		expect(notifySubmitted).toHaveBeenCalledTimes(1);
	});

	it("タイトルだけのPATCHは並行保存された見積もりを巻き戻さない", async () => {
		const db = localDb();
		db.seedTask();
		const patch = (body: object) =>
			taskRoutes.request(
				"http://local/t",
				{ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
				db.env,
			);
		const paused = db.pauseNextBatch();
		const titleRequest = patch({ title: "新しい課題" });
		await paused.entered;
		try {
			const estimateResponse = await patch({ estimateMin: 120 });
			expect(estimateResponse.status).toBe(200);
			expect(await estimateResponse.json()).toMatchObject({ estimateMin: 120 });
		} finally {
			paused.release();
		}
		expect((await titleRequest).status).toBe(200);
		expect(db.sqlite.prepare("SELECT title,estimate_min FROM tasks WHERE id='t'").get()).toMatchObject({
			title: "新しい課題",
			estimate_min: 120,
		});
	});

	it("Classroom完了は課題と同じbatchで作業記録と本人の作業中状態を終了する", async () => {
		const db = localDb();
		db.seedTask();
		db.seedWork();
		const item: ExistingItem = {
			id: "i",
			externalId: "ext",
			title: "課題",
			courseName: null,
			dueAt: NOW + 86_400_000,
			url: null,
			remoteState: "CREATED",
			payload: null,
			status: "linked",
			taskId: "t",
			pendingChange: null,
			lastSeenAt: NOW,
		};
		const plan = planIngest({
			now: NOW,
			existing: [item],
			snapshot: [{ externalId: "ext", title: "課題", dueAt: item.dueAt, remoteState: "TURNED_IN" }],
			tasks: new Map([["t", { id: "t", title: "課題", dueAt: NOW + 86_400_000, status: "doing" }]]),
		});
		// Exercise the batch boundary: the completion and both close statements must stay together.
		plan.updates = Array.from({ length: 39 }, (_, index) => ({ id: `missing-${index}`, set: { lastSeenAt: NOW } }));
		// Mixed-field updates aren't collapsed into the seen-only update.
		for (const update of plan.updates) update.set.title = "更新";
		await applyIngestPlan(getDb(db.env), "classroom", plan, NOW);
		expect(db.sqlite.prepare("SELECT status,submitted_at FROM tasks WHERE id='t'").get()).toMatchObject({
			status: "done",
			submitted_at: NOW,
		});
		expect(db.sqlite.prepare("SELECT end_at,review FROM sessions WHERE task_id='t'").get()).toMatchObject({
			end_at: NOW,
			review: "confirmed",
		});
		expect(db.sqlite.prepare("SELECT mode,task_id FROM user_status").get()).toMatchObject({
			mode: "normal",
			task_id: null,
		});
		const completionBatch = db.batches.find((batch) => batch.some((query) => query.startsWith('update "tasks"')));
		expect(completionBatch?.some((query) => query.startsWith('update "sessions"'))).toBe(true);
		expect(completionBatch?.some((query) => query.startsWith('update "user_status"'))).toBe(true);
	});

	it("旧doneの長時間未終了記録を完了時刻で仮閉鎖し、履歴の時刻と既存の確定記録を維持する", () => {
		const db = localDb(MIGRATIONS.slice(0, 4));
		db.seedTask("t", "done", NOW - 86_400_000);
		db.seedWork("t", NOW - 10 * 86_400_000);
		db.seedTask("open", "doing");
		db.seedTask("review-after-completion", "done", NOW - 7_200_000);
		db.sqlite
			.prepare(
				"INSERT INTO sessions(id,task_id,kind,start_at,end_at) VALUES('after','review-after-completion','actual',?,null)",
			)
			.run(NOW - 3_600_000);
		db.sqlite
			.prepare("INSERT INTO sessions(id,task_id,kind,start_at,end_at) VALUES('s-open','open','actual',?,null)")
			.run(NOW - 60_000);
		db.sqlite
			.prepare("INSERT INTO sessions(id,task_id,kind,start_at,end_at) VALUES('closed','t','actual',?,?)")
			.run(NOW - 100_000, NOW - 60_000);
		db.sqlite.exec(migration("0004_unify_task_completion.sql"));
		// 0004 has already been applied on local installations; repair must also work there.
		db.sqlite.exec(migration("0007_repair_completed_work.sql"));
		db.sqlite.exec(migration("0007_repair_completed_work.sql"));
		expect(db.sqlite.prepare("SELECT end_at,review FROM sessions WHERE id='s-t'").get()).toMatchObject({
			end_at: NOW - 86_400_000,
			review: "needs_review",
		});
		expect(db.sqlite.prepare("SELECT submitted_at,updated_at FROM tasks WHERE id='t'").get()).toMatchObject({
			submitted_at: NOW - 86_400_000,
			updated_at: NOW - 86_400_000,
		});
		expect(db.sqlite.prepare("SELECT mode,task_id FROM user_status").get()).toMatchObject({
			mode: "normal",
			task_id: null,
		});
		expect(db.sqlite.prepare("SELECT end_at,review FROM sessions WHERE id='closed'").get()).toMatchObject({
			end_at: NOW - 60_000,
			review: "confirmed",
		});
		expect(db.sqlite.prepare("SELECT end_at FROM sessions WHERE id='s-open'").get()).toMatchObject({
			end_at: null,
		});
		expect(db.sqlite.prepare("SELECT end_at,review FROM sessions WHERE id='after'").get()).toMatchObject({
			end_at: NOW - 3_600_000,
			review: "needs_review",
		});
	});
});
