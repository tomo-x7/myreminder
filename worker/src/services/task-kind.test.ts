import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { shouldNotifyCompletion } from "../notify/webhook";
import { taskCreateSchema, taskCreateWithRepeatSchema, taskUpdateSchema } from "../schemas/task";
import { normalizeTaskKind } from "./task-kind";

const base = { title: "連絡先を確認", dueAt: 1, estimateMin: 30 };

describe("作業時間を持たないメモ", () => {
	it("クライアントが作業時間・着手・通知を指定してもメモの制約を維持する", () => {
		const input = v.parse(taskCreateSchema, {
			...base,
			taskKind: "note",
			completionNotify: true,
			plannedStartAt: 1,
			releaseAt: 1,
		});
		expect(normalizeTaskKind(input)).toMatchObject({
			title: base.title,
			taskKind: "note",
			estimateMin: 0,
			completionNotify: false,
			plannedStartAt: null,
			releaseAt: null,
			minBlockMin: 1,
		});
	});
	it("0分はメモだけで受け付け、通常課題と負数は拒否する", () => {
		expect(v.safeParse(taskCreateSchema, { ...base, estimateMin: 0 }).success).toBe(false);
		expect(v.safeParse(taskCreateSchema, { ...base, taskKind: "note", estimateMin: 0 }).success).toBe(true);
		expect(v.safeParse(taskCreateSchema, { ...base, taskKind: "note", estimateMin: -1 }).success).toBe(false);
	});
	it("繰り返しでも種類を検証し、更新の省略で通常課題に戻さない", () => {
		const repeat = { freq: "weekly" as const, count: 2 };
		const result = v.parse(taskCreateWithRepeatSchema, { ...base, taskKind: "note", estimateMin: 0, repeat });
		expect(result.repeat?.count).toBe(2);
		expect(result.taskKind).toBe("note");
		expect(v.safeParse(taskCreateWithRepeatSchema, { ...base, estimateMin: 0, repeat }).success).toBe(false);
		expect(v.parse(taskUpdateSchema, { title: "変更" })).not.toHaveProperty("taskKind");
	});
	it("旧設定に通知有効が残っていてもメモの完了を通知しない", () => {
		expect(shouldNotifyCompletion({ status: "done", taskKind: "note", completionNotify: true })).toBe(false);
		expect(shouldNotifyCompletion({ status: "done", taskKind: "work", completionNotify: true })).toBe(true);
	});
});
