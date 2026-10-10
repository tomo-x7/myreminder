import { describe, expect, it } from "vitest";
import { DAY, HOUR } from "../planner/types";
import type { IngestItemInput } from "../schemas/ingest";
import { autoIgnoreReason, type ExistingItem, type LinkedTask, planIngest } from "./ingest";

const jst = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+09:00`);
const NOW = jst("2026-10-13 12:00");

const item = (over: Partial<IngestItemInput> = {}): IngestItemInput => ({
	externalId: "c1:w1",
	title: "第3回レポート",
	courseName: "情報倫理",
	dueAt: jst("2026-10-20 23:59"),
	url: "https://classroom.google.com/c/1/a/1",
	remoteState: "CREATED",
	description: "本文",
	kind: "ASSIGNMENT",
	...over,
});

/** snapshot の item と同じ内容で保存されている既存の行 */
const row = (over: Partial<ExistingItem> = {}): ExistingItem => ({
	id: "row1",
	externalId: "c1:w1",
	title: "第3回レポート",
	courseName: "情報倫理",
	dueAt: jst("2026-10-20 23:59"),
	url: "https://classroom.google.com/c/1/a/1",
	remoteState: "CREATED",
	payload: { description: "本文", kind: "ASSIGNMENT" },
	status: "pending",
	taskId: null,
	pendingChange: null,
	lastSeenAt: NOW - HOUR,
	...over,
});

const linkedRow = (over: Partial<ExistingItem> = {}) => row({ status: "linked", taskId: "t1", ...over });
const task = (over: Partial<LinkedTask> = {}): LinkedTask => ({
	id: "t1",
	title: "第3回レポート",
	dueAt: jst("2026-10-20 23:59"),
	status: "todo",
	...over,
});
const tasks = (...ts: LinkedTask[]) => new Map(ts.map((t) => [t.id, t]));

const run = (existing: ExistingItem[], snapshot: IngestItemInput[], t: LinkedTask[] = []) =>
	planIngest({ now: NOW, existing, snapshot, tasks: tasks(...t) });

describe("初めて見たもの", () => {
	it("受信箱に承認待ちで入る。締切が48時間より先なら通知しない", () => {
		const p = run([], [item()]);
		expect(p.result).toEqual({ received: 1, created: 1, autoIgnored: 0, updated: 0, unchanged: 0 });
		expect(p.creates).toHaveLength(1);
		expect(p.creates[0]).toMatchObject({
			status: "pending",
			firstSeenAt: NOW,
			lastSeenAt: NOW,
			payload: { description: "本文", kind: "ASSIGNMENT" },
		});
		expect(p.notifications).toEqual([]);
	});

	it("締切が48時間以内なら、すぐ inbox の通知を作る", () => {
		const p = run([], [item({ dueAt: NOW + 47 * HOUR })]);
		expect(p.notifications).toHaveLength(1);
		expect(p.notifications[0]).toMatchObject({ kind: "inbox", taskId: null, payload: { url: "/inbox" } });
		expect(p.notifications[0].payload.title).toContain("第3回レポート");
	});

	it("締切なしは通知しない", () => {
		expect(run([], [item({ dueAt: null })]).notifications).toEqual([]);
	});

	it("提出済み・返却済みは自動で無視する", () => {
		const p = run(
			[],
			[
				item({ externalId: "a", remoteState: "TURNED_IN" }),
				item({ externalId: "b", remoteState: "RETURNED", dueAt: null }),
			],
		);
		expect(p.result).toMatchObject({ created: 0, autoIgnored: 2 });
		expect(p.creates.map((c) => [c.status, c.payload.autoIgnored])).toEqual([
			["ignored", "submitted"],
			["ignored", "submitted"],
		]);
		expect(p.notifications).toEqual([]);
	});

	it("24時間より前に切れた締切は自動で無視する。ちょうど24時間前は受信箱に入る", () => {
		const p = run(
			[],
			[item({ externalId: "a", dueAt: NOW - DAY - 1 }), item({ externalId: "b", dueAt: NOW - DAY })],
		);
		expect(p.creates.find((c) => c.externalId === "a")).toMatchObject({
			status: "ignored",
			payload: { autoIgnored: "past_due" },
		});
		expect(p.creates.find((c) => c.externalId === "b")?.status).toBe("pending");
	});

	it("同じ externalId が2回あれば後のものを使う", () => {
		const p = run([], [item({ title: "古い" }), item({ title: "新しい" })]);
		expect(p.creates).toHaveLength(1);
		expect(p.creates[0].title).toBe("新しい");
		expect(p.result.received).toBe(2);
	});
});

describe("2回目以降", () => {
	it("同じスナップショットをもう一度送っても、書き込みは何もない", () => {
		const p = run([row()], [item()]);
		expect(p.result).toEqual({ received: 1, created: 0, autoIgnored: 0, updated: 0, unchanged: 1 });
		expect(p.creates).toEqual([]);
		expect(p.updates).toEqual([]);
		expect(p.taskChanges).toEqual([]);
		expect(p.notifications).toEqual([]);
	});

	it("スナップショットにない行は何もしない", () => {
		const p = run([row(), row({ id: "row2", externalId: "gone", status: "ignored" })], [item()]);
		expect(p.updates).toEqual([]);
		expect(p.result.received).toBe(1);
	});

	it("lastSeenAt は24時間以上たったときだけ更新する", () => {
		expect(run([row({ lastSeenAt: NOW - DAY + 1 })], [item()]).updates).toEqual([]);
		const p = run([row({ lastSeenAt: NOW - DAY })], [item()]);
		expect(p.updates).toEqual([{ id: "row1", set: { lastSeenAt: NOW } }]);
		expect(p.result.unchanged).toBe(1);
	});

	it("承認待ちは上書きする(通知は出さない)", () => {
		const p = run([row()], [item({ title: "第3回レポート(改)", dueAt: NOW + HOUR })]);
		expect(p.result).toMatchObject({ updated: 1, unchanged: 0, created: 0 });
		expect(p.updates[0].set).toMatchObject({ title: "第3回レポート(改)", dueAt: NOW + HOUR, lastSeenAt: NOW });
		expect(p.notifications).toEqual([]);
	});

	it("承認待ちのまま取り込み元で提出されたら、自動で無視する", () => {
		const p = run([row()], [item({ remoteState: "TURNED_IN" })]);
		expect(p.updates[0].set).toMatchObject({
			status: "ignored",
			remoteState: "TURNED_IN",
			payload: { autoIgnored: "submitted" },
		});
		expect(p.taskChanges).toEqual([]);
	});

	it("無視した行は上書きするだけで、二度と承認待ちに戻さない", () => {
		const p = run(
			[row({ status: "ignored", payload: { description: "本文", kind: "ASSIGNMENT" } })],
			[item({ title: "別のタイトル", dueAt: NOW + HOUR })],
		);
		expect(p.result.created).toBe(0);
		expect(p.updates[0].set).toMatchObject({ title: "別のタイトル" });
		expect(p.updates[0].set).not.toHaveProperty("status");
		expect(p.notifications).toEqual([]);
	});

	it("自動無視の記録は上書きしても残る", () => {
		const p = run(
			[row({ status: "ignored", payload: { description: "本文", kind: "ASSIGNMENT", autoIgnored: "past_due" } })],
			[item({ description: "変わった本文" })],
		);
		expect(p.updates[0].set.payload).toEqual({
			description: "変わった本文",
			kind: "ASSIGNMENT",
			autoIgnored: "past_due",
		});
	});

	it("紐付け済みでタスクが消えた行は、無視と同じ扱い", () => {
		const p = run([linkedRow({ taskId: null })], [item({ dueAt: NOW + HOUR })]);
		expect(p.taskChanges).toEqual([]);
		expect(p.notifications).toEqual([]);
		expect(p.updates[0].set).not.toHaveProperty("pendingChange");
	});
});

describe("紐付け済みの変化", () => {
	it("締切が早まったら、すぐタスクに反映して due_change を作る", () => {
		const earlier = jst("2026-10-18 23:59");
		const p = run([linkedRow()], [item({ dueAt: earlier })], [task()]);
		expect(p.taskChanges).toEqual([
			{
				taskId: "t1",
				set: { dueAt: earlier },
				dueHistory: [{ oldDueAt: jst("2026-10-20 23:59"), newDueAt: earlier }],
			},
		]);
		expect(p.notifications).toHaveLength(1);
		expect(p.notifications[0]).toMatchObject({ kind: "due_change", taskId: "t1" });
		expect(p.notifications[0].payload.title).toContain("締切が早まりました");
		expect(p.notifications[0].payload.body).toContain("→");
		expect(p.updates[0].set).toMatchObject({ dueAt: earlier });
		expect(p.updates[0].set.pendingChange).toBeUndefined();
	});

	it("締切が遅くなったら、変更の提案にする。タスクは変えない", () => {
		const later = jst("2026-10-25 23:59");
		const p = run([linkedRow()], [item({ dueAt: later })], [task()]);
		expect(p.taskChanges).toEqual([]);
		expect(p.notifications).toEqual([]);
		expect(p.updates[0].set.pendingChange).toEqual({ dueAt: { from: jst("2026-10-20 23:59"), to: later } });
	});

	it("取り込み元が変わっても、タスクの締切と同じなら何もしない", () => {
		const manual = jst("2026-10-22 23:59");
		const p = run([linkedRow()], [item({ dueAt: manual })], [task({ dueAt: manual })]);
		expect(p.taskChanges).toEqual([]);
		expect(p.notifications).toEqual([]);
		expect(p.updates[0].set.pendingChange).toBeUndefined();
	});

	it("本人がタスク側の締切を手で直していても、取り込み元が変わらなければ何もしない", () => {
		const p = run([linkedRow()], [item()], [task({ dueAt: jst("2026-10-15 23:59") })]);
		expect(p.taskChanges).toEqual([]);
		expect(p.updates).toEqual([]);
	});

	it("締切が null になっても何もしない", () => {
		const p = run([linkedRow()], [item({ dueAt: null })], [task()]);
		expect(p.taskChanges).toEqual([]);
		expect(p.notifications).toEqual([]);
		expect(p.updates[0].set.pendingChange).toBeUndefined();
	});

	it("タイトルが変わったら、変更の提案にする(タスクのタイトルとの比較)", () => {
		const p = run([linkedRow()], [item({ title: "第3回レポート(再提出)" })], [task({ title: "レポート3" })]);
		expect(p.taskChanges).toEqual([]);
		expect(p.updates[0].set.pendingChange).toEqual({ title: { from: "レポート3", to: "第3回レポート(再提出)" } });
	});

	it("タイトルが変わってもタスクのタイトルと同じなら、提案しない", () => {
		const p = run([linkedRow()], [item({ title: "レポート3" })], [task({ title: "レポート3" })]);
		expect(p.updates[0].set.pendingChange).toBeUndefined();
	});

	it("締切とタイトルが一緒に変わると、1つの提案にまとまる", () => {
		const later = jst("2026-10-25 23:59");
		const p = run([linkedRow()], [item({ title: "新題", dueAt: later })], [task()]);
		expect(p.updates[0].set.pendingChange).toEqual({
			dueAt: { from: jst("2026-10-20 23:59"), to: later },
			title: { from: "第3回レポート", to: "新題" },
		});
	});

	it("提案が残っている行で、締切がさらに早まったら、その提案の締切は消える", () => {
		const earlier = jst("2026-10-18 23:59");
		const pendingChange = {
			dueAt: { from: jst("2026-10-20 23:59"), to: jst("2026-10-25 23:59") },
			title: { from: "a", to: "b" },
		};
		const p = run(
			[linkedRow({ pendingChange, dueAt: jst("2026-10-25 23:59") })],
			[item({ dueAt: earlier })],
			[task()],
		);
		expect(p.taskChanges[0].set.dueAt).toBe(earlier);
		expect(p.updates[0].set.pendingChange).toEqual({ title: { from: "a", to: "b" } });
	});

	it("提案が残っている行で、さらに変わらなければ提案はそのまま(書き込まない)", () => {
		const pendingChange = { title: { from: "a", to: "第3回レポート(改)" } };
		const p = run(
			[linkedRow({ pendingChange, title: "第3回レポート(改)" })],
			[item({ title: "第3回レポート(改)" })],
			[task()],
		);
		expect(p.updates).toEqual([]);
	});

	it("TURNED_IN になったら、タスクを submitted にして webhook の対象にする", () => {
		const p = run([linkedRow()], [item({ remoteState: "TURNED_IN" })], [task({ status: "doing" })]);
		expect(p.taskChanges).toEqual([
			{ taskId: "t1", set: { status: "submitted", submittedAt: NOW }, dueHistory: [] },
		]);
		expect(p.submittedTaskIds).toEqual(["t1"]);
		expect(p.notifications).toEqual([]);
	});

	it("TURNED_IN でも、タスクがすでに submitted なら何もしない", () => {
		const p = run([linkedRow()], [item({ remoteState: "TURNED_IN" })], [task({ status: "submitted" })]);
		expect(p.taskChanges).toEqual([]);
		expect(p.submittedTaskIds).toEqual([]);
	});

	it("前回も TURNED_IN なら、他の項目が変わっても再び提出済みにしない", () => {
		const p = run(
			[linkedRow({ remoteState: "TURNED_IN" })],
			[item({ remoteState: "TURNED_IN", description: "追記" })],
			[task({ status: "todo" })],
		);
		expect(p.taskChanges).toEqual([]);
		expect(p.submittedTaskIds).toEqual([]);
	});

	it("RECLAIMED_BY_STUDENT になったら、submitted のタスクを todo に戻して通知する", () => {
		const p = run(
			[linkedRow({ remoteState: "TURNED_IN" })],
			[item({ remoteState: "RECLAIMED_BY_STUDENT" })],
			[task({ status: "submitted" })],
		);
		expect(p.taskChanges).toEqual([{ taskId: "t1", set: { status: "todo", submittedAt: null }, dueHistory: [] }]);
		expect(p.notifications).toHaveLength(1);
		expect(p.notifications[0]).toMatchObject({ kind: "inbox", taskId: "t1" });
		expect(p.notifications[0].payload.title).toContain("提出が取り消されています");
	});

	it("RECLAIMED_BY_STUDENT でも、タスクが submitted でなければ何もしない", () => {
		const p = run(
			[linkedRow({ remoteState: "TURNED_IN" })],
			[item({ remoteState: "RECLAIMED_BY_STUDENT" })],
			[task({ status: "doing" })],
		);
		expect(p.taskChanges).toEqual([]);
		expect(p.notifications).toEqual([]);
	});

	it("同じタスクに紐付いた2行が両方変わっても、タスクの状態が矛盾しない", () => {
		const a = linkedRow({ id: "r1", externalId: "a", dueAt: jst("2026-10-20 23:59") });
		const b = linkedRow({ id: "r2", externalId: "b", dueAt: jst("2026-10-20 23:59") });
		const p = run(
			[a, b],
			[
				item({ externalId: "a", dueAt: jst("2026-10-18 23:59") }),
				item({ externalId: "b", dueAt: jst("2026-10-19 23:59") }),
			],
			[task()],
		);
		// 2行目(10/19)は、1行目で動いたあとの締切(10/18)より遅いので、提案になる
		expect(p.taskChanges).toHaveLength(1);
		expect(p.taskChanges[0].set.dueAt).toBe(jst("2026-10-18 23:59"));
		expect(p.updates.find((u) => u.id === "r2")?.set.pendingChange).toEqual({
			dueAt: { from: jst("2026-10-18 23:59"), to: jst("2026-10-19 23:59") },
		});
	});
});

describe("autoIgnoreReason", () => {
	it("提出済みが優先される", () => {
		expect(autoIgnoreReason({ dueAt: NOW - 5 * DAY, remoteState: "TURNED_IN" }, NOW)).toBe("submitted");
	});
	it("締切なし・CREATED は無視しない", () => {
		expect(autoIgnoreReason({ dueAt: null, remoteState: "CREATED" }, NOW)).toBeNull();
	});
});
