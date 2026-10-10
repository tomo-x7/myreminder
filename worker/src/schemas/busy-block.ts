// 時間割・バイト・予定(busy_blocks)の入力スキーマ。
// 繰り返し(weekday + JST 0時からの分 + 任意の期間)と単発(epoch ms)の2形。混ぜたら不正
import * as v from "valibot";
import { BUSY_KINDS } from "../db/schema";

const epochMs = v.pipe(v.number(), v.integer(), v.minValue(0));
const minuteOfDay = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1440));
const kind = v.picklist(BUSY_KINDS);
const label = v.pipe(v.string(), v.trim(), v.maxLength(100));
const absent = v.optional(v.null_());

const recurringSchema = v.pipe(
	v.object({
		kind,
		label: v.optional(label, ""),
		// 0=日 〜 6=土(JST)
		weekday: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
		startMin: minuteOfDay,
		endMin: minuteOfDay,
		dateFrom: v.optional(v.nullable(epochMs), null),
		dateTo: v.optional(v.nullable(epochMs), null),
		startAt: absent,
		endAt: absent,
	}),
	v.forward(
		v.check((b) => b.endMin > b.startMin, "endMin must be greater than startMin"),
		["endMin"],
	),
	v.forward(
		v.check(
			(b) => b.dateFrom == null || b.dateTo == null || b.dateTo >= b.dateFrom,
			"dateTo must not precede dateFrom",
		),
		["dateTo"],
	),
);

const oneOffSchema = v.pipe(
	v.object({
		kind,
		label: v.optional(label, ""),
		startAt: epochMs,
		endAt: epochMs,
		weekday: absent,
		startMin: absent,
		endMin: absent,
		dateFrom: absent,
		dateTo: absent,
	}),
	v.forward(
		v.check((b) => b.endAt > b.startAt, "endAt must be greater than startAt"),
		["endAt"],
	),
);

export const busyBlockCreateSchema = v.union([recurringSchema, oneOffSchema]);
export type BusyBlockCreateInput = v.InferInput<typeof busyBlockCreateSchema>;
export type BusyBlockValue = v.InferOutput<typeof busyBlockCreateSchema>;

// PATCH は項目単位。既存の行とマージしたうえで busyBlockCreateSchema で検証し直す
// (形を切り替えるときは、使わない側を null で明示する)
export const busyBlockUpdateSchema = v.object({
	kind: v.optional(kind),
	label: v.optional(label),
	weekday: v.optional(v.nullable(v.number())),
	startMin: v.optional(v.nullable(v.number())),
	endMin: v.optional(v.nullable(v.number())),
	startAt: v.optional(v.nullable(v.number())),
	endAt: v.optional(v.nullable(v.number())),
	dateFrom: v.optional(v.nullable(v.number())),
	dateTo: v.optional(v.nullable(v.number())),
});
export type BusyBlockUpdateInput = v.InferInput<typeof busyBlockUpdateSchema>;
