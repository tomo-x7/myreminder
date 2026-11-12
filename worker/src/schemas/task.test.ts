import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { taskCreateSchema, taskUpdateSchema } from "./task";

const input = { title: "課題", dueAt: 1, estimateMin: 30 };

describe("課題の完了通知入力", () => {
	it("作成の既定値は従来の通知あり、更新で省略した値は変更しない", () => {
		expect(v.parse(taskCreateSchema, input).completionNotify).toBe(true);
		expect(v.parse(taskUpdateSchema, { title: "変更" })).not.toHaveProperty("completionNotify");
		expect(v.parse(taskUpdateSchema, { completionNotify: false })).toEqual({ completionNotify: false });
	});
	it("一回の非通知は完了操作だけに指定できる", () => {
		for (const status of ["done", "submitted"]) {
			expect(v.safeParse(taskUpdateSchema, { status, silent: true }).success).toBe(true);
		}
		for (const patch of [{ silent: true }, { status: "todo", silent: true }, { status: "doing", silent: true }]) {
			expect(v.safeParse(taskUpdateSchema, patch).success).toBe(false);
		}
	});
	it("文字列やnullの通知設定は受け付けない", () => {
		for (const completionNotify of ["false", null, 0]) {
			expect(v.safeParse(taskCreateSchema, { ...input, completionNotify }).success).toBe(false);
		}
	});
});
