// モデルが返す JSON の形(valibot)と、JSON mode に渡す JSON Schema。
// 小さいモデルは null と "" や数値と文字列を取り違えるので、欄ごとに寛容に読む(壊れた欄は fallback)。
// 壊れたら捨てるのは「候補1件」だけで、全体は落とさない
import * as v from "valibot";
import { REPEAT_FREQS, TASK_CATEGORIES } from "../db/schema";

const toText = (x: unknown): string | null => {
	if (typeof x !== "string") return null;
	const t = x.trim();
	return t === "" || t.toLowerCase() === "null" ? null : t;
};

const toNumber = (x: unknown): number | null => {
	if (typeof x === "number") return Number.isFinite(x) ? x : null;
	if (typeof x === "string") {
		const n = Number(x.normalize("NFKC").trim());
		return x.trim() !== "" && Number.isFinite(n) ? n : null;
	}
	return null;
};

// キーが無い場合も null として読む(v.object は欠けたキーを既定値なしでは弾くため default を付ける)
const optText = v.optional(v.pipe(v.unknown(), v.transform(toText)), null);
const optNumber = v.optional(v.pipe(v.unknown(), v.transform(toNumber)), null);

// 繰り返し。文に「毎週」「隔週」「毎月」などがあるときだけ。範囲外・読めない値は null(候補ごと捨てない)
const rawRepeatSchema = v.object({
	freq: v.pipe(
		v.unknown(),
		v.transform((x) => (typeof x === "string" ? x.trim().toLowerCase() : x)),
		v.picklist(REPEAT_FREQS),
	),
	interval: v.optional(
		v.pipe(
			v.unknown(),
			v.transform((x) => toNumber(x) ?? 1),
			v.integer(),
			v.minValue(1),
			v.maxValue(12),
		),
		1,
	),
});
export type RawRepeat = v.InferOutput<typeof rawRepeatSchema>;
const optRepeat = v.optional(
	v.pipe(
		v.unknown(),
		v.transform((x): RawRepeat | null => {
			const r = v.safeParse(rawRepeatSchema, x);
			return r.success ? r.output : null;
		}),
	),
	null,
);

export const rawCandidateSchema = v.object({
	title: v.pipe(
		v.unknown(),
		v.transform(toText),
		v.check((t): t is string => t !== null, "title is required"),
		v.transform((t) => t as string),
	),
	courseName: optText,
	category: v.optional(v.fallback(v.picklist(TASK_CATEGORIES), "other"), "other"),
	due: optText,
	dueText: optText,
	estimateMin: optNumber,
	firstStep: optText,
	repeat: optRepeat,
	confidence: optNumber,
});
export type RawCandidate = v.InferOutput<typeof rawCandidateSchema>;

/** { candidates: [...] }・配列そのもの・1件のオブジェクトのどれで返してきても受ける */
const wrap = (x: unknown): unknown => {
	if (Array.isArray(x)) return { candidates: x };
	if (x && typeof x === "object" && !("candidates" in x) && "title" in x) return { candidates: [x] };
	return x;
};

export const candidatesResponseSchema = v.pipe(
	v.unknown(),
	v.transform(wrap),
	v.object({
		candidates: v.pipe(
			v.array(v.unknown()),
			v.transform((items) =>
				items.flatMap((item) => {
					const r = v.safeParse(rawCandidateSchema, item);
					return r.success ? [r.output] : [];
				}),
			),
		),
	}),
);
export type CandidatesResponse = v.InferOutput<typeof candidatesResponseSchema>;

const nullable = (type: "string" | "number") => ({ anyOf: [{ type }, { type: "null" }] });

/** JSON mode(response_format.json_schema)に渡す。Workers AI は JSON Schema 本体をそのまま受ける */
export const candidatesJsonSchema = {
	type: "object",
	properties: {
		candidates: {
			type: "array",
			items: {
				type: "object",
				properties: {
					title: { type: "string" },
					courseName: nullable("string"),
					category: { type: "string", enum: [...TASK_CATEGORIES] },
					due: nullable("string"),
					dueText: nullable("string"),
					estimateMin: nullable("number"),
					firstStep: nullable("string"),
					repeat: {
						anyOf: [
							{
								type: "object",
								properties: {
									freq: { type: "string", enum: [...REPEAT_FREQS] },
									interval: { type: "number" },
								},
								required: ["freq", "interval"],
							},
							{ type: "null" },
						],
					},
					confidence: { type: "number" },
				},
				required: [
					"title",
					"courseName",
					"category",
					"due",
					"dueText",
					"estimateMin",
					"firstStep",
					"repeat",
					"confidence",
				],
			},
		},
	},
	required: ["candidates"],
} as const;
