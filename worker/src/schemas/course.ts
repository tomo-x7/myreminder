// 科目の入力スキーマ
import * as v from "valibot";

export const courseCreateSchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
	// 取り込み元ごとの表記揺れ
	aliases: v.optional(
		v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))), v.maxLength(30)),
		[],
	),
	color: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(30)))),
});
export type CourseCreateInput = v.InferInput<typeof courseCreateSchema>;

export const courseUpdateSchema = v.partial(courseCreateSchema);
export type CourseUpdateInput = v.InferInput<typeof courseUpdateSchema>;
