// ステータスと作業記録の入力スキーマ
import * as v from "valibot";

const epochMs = v.pipe(v.number(), v.integer(), v.minValue(0));
const epochMsQuery = v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number));

/** 「どれくらい進んだ?」の選択肢 */
export const PROGRESS_STEPS = [0, 25, 50, 75, 100] as const;

export const statusSetSchema = v.object({
	mode: v.picklist(["normal", "busy", "sleep"]),
	// null/省略は期限なし(normal + 期限なしは手動設定の解除)
	until: v.optional(v.nullable(epochMs), null),
});

export const workingStartSchema = v.object({ taskId: v.pipe(v.string(), v.minLength(1)) });

export const workingStopSchema = v.object({
	progress: v.picklist(PROGRESS_STEPS),
	// 「○分前に終わった」用
	endAt: v.optional(epochMs),
});

const progress = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100));

export const sessionCreateSchema = v.object({
	taskId: v.pipe(v.string(), v.minLength(1)),
	startAt: epochMs,
	endAt: epochMs,
	progress: v.optional(v.nullable(progress)),
});

export const sessionUpdateSchema = v.object({
	startAt: v.optional(epochMs),
	endAt: v.optional(epochMs),
	progress: v.optional(v.nullable(progress)),
	review: v.optional(v.literal("confirmed")),
});

export const sessionListQuerySchema = v.object({
	from: v.optional(epochMsQuery),
	to: v.optional(epochMsQuery),
});
