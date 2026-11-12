import { afterEach, describe, expect, it, vi } from "vitest";
import { ingest as ingestRoutes } from "../routes/ingest";
import { tasks as taskRoutes } from "../routes/tasks";
import { createTestDb, type LocalD1, NOW } from "../test-utils/sqlite-d1";

vi.mock("../notify/replan", () => ({ triggerReplan() {} }));
const opened: LocalD1[] = [];
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	for (const local of opened.splice(0)) local.sqlite.close();
});
const context = () => {
	const jobs: Promise<unknown>[] = [];
	return {
		jobs,
		ctx: {
			waitUntil(job: Promise<unknown>) {
				jobs.push(job);
			},
			passThroughOnException() {},
			props: {},
		} as unknown as ExecutionContext,
	};
};
const json = (body: object) => ({
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify(body),
});

describe("取り込み完了と他経路の完了の競合", () => {
	it.each(["manual", "silent", "ingest"])("先に%sが完了したら取り込みから重ねて報告しない", async (competitor) => {
		const clock = vi.spyOn(Date, "now").mockReturnValue(NOW);
		const local = createTestDb();
		opened.push(local);
		local.seedTask("t", "todo");
		const dueAt = NOW + 86_400_000;
		local.sqlite
			.prepare(
				"INSERT INTO ingest_items(id,source,external_id,title,due_at,remote_state,status,task_id,first_seen_at,last_seen_at) VALUES('item','classroom','external','課題',?,'CREATED','linked','t',?,?)",
			)
			.run(dueAt, NOW, NOW);
		local.sqlite
			.prepare(
				"INSERT INTO webhooks(id,kind,url,events) VALUES('local','discord','https://example.invalid/webhook','[\"submitted\"]')",
			)
			.run();
		// Webhookの実装まで通し、HTTPだけをmockする。外部通信は行わない。
		const delivered = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", delivered);
		const firstCtx = context();
		const secondCtx = context();
		const snapshot = {
			items: [{ externalId: "external", title: "課題", dueAt: dueAt - 3_600_000, remoteState: "TURNED_IN" }],
		};
		const paused = local.pauseNextBatch();
		const first = ingestRoutes.request("http://local/classroom", json(snapshot), local.env, firstCtx.ctx);
		await paused.entered;
		try {
			clock.mockReturnValue(NOW + 5_000);
			const second =
				competitor === "ingest"
					? await ingestRoutes.request("http://local/classroom", json(snapshot), local.env, secondCtx.ctx)
					: await taskRoutes.request(
							"http://local/t",
							{ ...json({ status: "done", silent: competitor === "silent" }), method: "PATCH" },
							local.env,
							secondCtx.ctx,
						);
			expect(second.status).toBe(200);
			await Promise.all(secondCtx.jobs);
		} finally {
			paused.release();
		}
		expect((await first).status).toBe(200);
		await Promise.all(firstCtx.jobs);
		expect(delivered).toHaveBeenCalledTimes(competitor === "silent" ? 0 : 1);
		expect(local.sqlite.prepare("SELECT status,due_at,submitted_at FROM tasks WHERE id='t'").get()).toMatchObject({
			status: "done",
			due_at: dueAt - 3_600_000,
			submitted_at: NOW + 5_000,
		});
	});
});
