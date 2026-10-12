// タスクの入力スキーマ。#6(CRUD API)と #9(AI による手動登録)の受け渡しの約束
import * as v from "valibot";
import { ESTIMATE_SOURCES, TASK_CATEGORIES, TASK_STATUSES } from "../db/schema";
import { repeatSchema } from "./series";

const epochMs = v.pipe(v.number(), v.integer(), v.minValue(0));
const minutes = v.pipe(v.number(), v.integer(), v.minValue(1));

export const taskCreateSchema = v.object({
	title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
	courseId: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
	category: v.optional(v.picklist(TASK_CATEGORIES), "other"),
	dueAt: epochMs,
	releaseAt: v.optional(v.nullable(epochMs)),
	estimateMin: minutes,
	estimateSource: v.optional(v.picklist(ESTIMATE_SOURCES), "manual"),
	minBlockMin: v.optional(minutes, 30),
	plannedStartAt: v.optional(v.nullable(epochMs)),
	firstStep: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
	note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(2000)))),
});
export type TaskCreateInput = v.InferInput<typeof taskCreateSchema>;

// 登録(POST /api/tasks)だけ repeat を受ける。更新(PATCH)は繰り返しを変えない
export const taskCreateWithRepeatSchema = v.object({
	...taskCreateSchema.entries,
	repeat: v.optional(v.nullable(repeatSchema)),
});

export const taskUpdateSchema = v.partial(
	v.object({
		...taskCreateSchema.entries,
		status: v.picklist(TASK_STATUSES),
	}),
);
export type TaskUpdateInput = v.InferInput<typeof taskUpdateSchema>;
