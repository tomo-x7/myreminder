// タスクの入力スキーマ。#6(CRUD API)と #9(AI による手動登録)の受け渡しの約束
import * as v from "valibot";
import { ESTIMATE_SOURCES, TASK_CATEGORIES, TASK_KINDS, TASK_STATUSES } from "../db/schema";
import { repeatSchema } from "./series";

const epochMs = v.pipe(v.number(), v.integer(), v.minValue(0));
const minutes = v.pipe(v.number(), v.integer(), v.minValue(1));

const taskFields = v.object({
	title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
	courseId: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
	category: v.optional(v.picklist(TASK_CATEGORIES), "other"),
	taskKind: v.optional(v.picklist(TASK_KINDS), "work"),
	dueAt: epochMs,
	releaseAt: v.optional(v.nullable(epochMs)),
	estimateMin: v.pipe(v.number(), v.integer(), v.minValue(0)),
	estimateSource: v.optional(v.picklist(ESTIMATE_SOURCES), "manual"),
	minBlockMin: v.optional(minutes, 30),
	plannedStartAt: v.optional(v.nullable(epochMs)),
	firstStep: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
	completionNotify: v.optional(v.boolean(), true),
	note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(2000)))),
});
export const taskCreateSchema = v.pipe(
	taskFields,
	v.forward(
		v.check((input) => input.taskKind === "note" || input.estimateMin >= 1, "通常の課題の見積もりは1以上の整数"),
		["estimateMin"],
	),
);
export type TaskCreateInput = v.InferInput<typeof taskCreateSchema>;

// 登録(POST /api/tasks)だけ repeat を受ける。更新(PATCH)は繰り返しを変えない
export const taskCreateWithRepeatSchema = v.pipe(
	v.object({ ...taskFields.entries, repeat: v.optional(v.nullable(repeatSchema)) }),
	v.forward(
		v.check((input) => input.taskKind === "note" || input.estimateMin >= 1, "通常の課題の見積もりは1以上の整数"),
		["estimateMin"],
	),
);

export const taskUpdateSchema = v.pipe(
	v.partial(
		v.object({
			...taskFields.entries,
			status: v.picklist(TASK_STATUSES),
			// この完了操作だけ通知しない。DBへは保存しない。
			silent: v.boolean(),
		}),
	),
	v.forward(
		v.partialCheck(
			[["silent"], ["status"]],
			(input) => !input.silent || input.status === "done" || input.status === "submitted",
			"silent は完了時のみ指定できる",
		),
		["silent"],
	),
);
export type TaskUpdateInput = v.InferInput<typeof taskUpdateSchema>;
