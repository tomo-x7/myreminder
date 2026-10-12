// 繰り返しの入力スキーマ(仕様: ai-docs/specs/recurrence.md)。
// POST /api/tasks の repeat と POST /api/tasks/:id/repeat の本文で共通
import * as v from "valibot";
import { REPEAT_FREQS } from "../db/schema";

export const repeatSchema = v.pipe(
	v.object({
		freq: v.picklist(REPEAT_FREQS),
		// 毎週の 2 = 隔週
		interval: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12)), 1),
		// 最初の回を含む回数
		count: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)))),
		// JST の日の 0:00(その日の締切まで含む)。日の途中の時刻が来てもその日として扱う
		until: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
	}),
	v.forward(
		v.partialCheck(
			[["count"], ["until"]],
			(r) => r.count == null || r.until == null,
			"count と until は同時に指定できない",
		),
		["until"],
	),
);
export type RepeatInput = v.InferOutput<typeof repeatSchema>;
