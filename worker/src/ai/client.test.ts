import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
	type ClientDeps,
	extractModelOutput,
	FALLBACK_MODEL,
	PRIMARY_MODEL,
	parseJsonLoose,
	runJson,
	stripThink,
} from "./client";
import { candidatesJsonSchema, candidatesResponseSchema } from "./schemas";

describe("stripThink", () => {
	it("思考ブロックを取り除く(複数・空・改行入り)", () => {
		expect(stripThink('<think>\n\n</think>\n\n{"a":1}')).toBe('{"a":1}');
		expect(stripThink('<think>最初に考える\n次に考える</think>{"a":1}<think>x</think>')).toBe('{"a":1}');
	});

	it("閉じていない <think> は途中で切れているので null", () => {
		expect(stripThink('<think>考え中 {"a":1}')).toBeNull();
	});
});

describe("parseJsonLoose", () => {
	it("素の JSON / コードフェンス / 前後の説明文 / think 付き", () => {
		expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
		expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
		expect(parseJsonLoose('結果です。\n{"a":{"b":[1,2]}}\n以上')).toEqual({ a: { b: [1, 2] } });
		expect(parseJsonLoose('<think>{"x":0}</think>\n{"a":1}')).toEqual({ a: 1 });
	});

	it("文字列中の括弧に惑わされない", () => {
		expect(parseJsonLoose('前置き {"t":"レポート } (2000字) {"} 後書き')).toEqual({ t: "レポート } (2000字) {" });
	});

	it("壊れていれば undefined", () => {
		expect(parseJsonLoose("申し訳ありません")).toBeUndefined();
		expect(parseJsonLoose('{"a":')).toBeUndefined();
		expect(parseJsonLoose("")).toBeUndefined();
	});
});

describe("extractModelOutput", () => {
	it("qwen3(OpenAI 互換)・llama(response)・文字列・パース済みオブジェクト", () => {
		expect(
			extractModelOutput({
				choices: [{ message: { role: "assistant", content: "{}", reasoning_content: "…" } }],
			}),
		).toEqual({
			text: "{}",
		});
		expect(extractModelOutput({ response: "{}" })).toEqual({ text: "{}" });
		expect(extractModelOutput({ response: { candidates: [] } })).toEqual({ json: { candidates: [] } });
		expect(extractModelOutput("{}")).toEqual({ text: "{}" });
	});

	it("content が null(思考で token を使い切った)なら null", () => {
		expect(extractModelOutput({ choices: [{ message: { role: "assistant", content: null } }] })).toBeNull();
	});
});

// モデルの実出力を想定したサンプル
const GOOD =
	'{"candidates":[{"title":"レポート(2000字)","courseName":"情報倫理","category":"report","due":"2026-10-12T10:40","dueText":"来週月曜の授業前まで","estimateMin":180,"firstStep":"見出しを書く","confidence":0.9}]}';

function fakeDeps(responses: (unknown | Error)[]) {
	const calls: { model: string; input: Record<string, unknown> }[] = [];
	const logs: { model: string; status: string; error: string | null }[] = [];
	const deps: ClientDeps = {
		run: async (model, input) => {
			calls.push({ model, input });
			const r = responses[calls.length - 1];
			if (r instanceof Error) throw r;
			return r;
		},
		log: async (e) => {
			logs.push({ model: e.model, status: e.status, error: e.error });
		},
	};
	return { deps, calls, logs };
}

const opts = {
	purpose: "parse_line",
	messages: [
		{ role: "system" as const, content: "sys" },
		{ role: "user" as const, content: "入力" },
	],
	schema: candidatesResponseSchema,
	jsonSchema: candidatesJsonSchema,
};
const qwen = (content: string) => ({ choices: [{ message: { role: "assistant", content } }] });

describe("runJson", () => {
	it("主力が think 付きで返しても成功し、ログは1件", async () => {
		const { deps, calls, logs } = fakeDeps([qwen(`<think>\n\n</think>\n${GOOD}`)]);
		const r = await runJson({} as CloudflareBindings, opts, deps);
		expect(r.ok && r.model).toBe(PRIMARY_MODEL);
		expect(r.ok && r.data.candidates[0]?.title).toBe("レポート(2000字)");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.input.response_format).toBeUndefined();
		// 思考を切るスイッチは主力にだけ付く
		expect((calls[0]?.input.messages as { content: string }[])[1]?.content).toContain("/no_think");
		expect(logs).toEqual([{ model: PRIMARY_MODEL, status: "ok", error: null }]);
	});

	it("壊れた出力 → json_schema 付きで1回再試行して成功", async () => {
		const { deps, calls, logs } = fakeDeps([qwen("すみません、分かりませんでした"), qwen(GOOD)]);
		const r = await runJson({} as CloudflareBindings, opts, deps);
		expect(r.ok && r.model).toBe(PRIMARY_MODEL);
		expect(calls[1]?.input.response_format).toMatchObject({ type: "json_schema" });
		expect(logs.map((l) => l.status)).toEqual(["error", "ok"]);
	});

	it("主力が2回とも失敗 → 予備モデルの JSON mode(response がオブジェクトでも読める)", async () => {
		const { deps, calls } = fakeDeps([qwen("x"), new Error("boom"), { response: JSON.parse(GOOD) }]);
		const r = await runJson({} as CloudflareBindings, opts, deps);
		expect(r.ok && r.model).toBe(FALLBACK_MODEL);
		expect(calls.map((c) => c.model)).toEqual([PRIMARY_MODEL, PRIMARY_MODEL, FALLBACK_MODEL]);
		// 予備にはソフトスイッチを付けない
		expect((calls[2]?.input.messages as { content: string }[])[1]?.content).not.toContain("/no_think");
	});

	it("「JSON Mode couldn't be met」は次の試行に回り、全部だめなら型付きの失敗(例外は投げない)", async () => {
		const unmet = new Error("5024: JSON Mode couldn't be met");
		const { deps, logs } = fakeDeps([qwen("x"), unmet, unmet]);
		const r = await runJson({} as CloudflareBindings, opts, deps);
		expect(r).toMatchObject({ ok: false, code: "upstream" });
		expect(logs.every((l) => l.status === "error")).toBe(true);
		expect(logs).toHaveLength(3);
	});

	it("無料枠切れは再試行せず打ち切る", async () => {
		const { deps, calls } = fakeDeps([
			new Error("4006: you have used up your daily free allocation of 10,000 neurons"),
		]);
		const r = await runJson({} as CloudflareBindings, opts, deps);
		expect(r).toMatchObject({ ok: false, code: "quota" });
		expect(calls).toHaveLength(1);
	});

	it("schema を満たさない出力は invalid_output", async () => {
		const strict = { ...opts, schema: v.object({ must: v.string() }) };
		const { deps } = fakeDeps([qwen("{}"), qwen("{}"), { response: {} }]);
		const r = await runJson({} as CloudflareBindings, strict, deps);
		expect(r).toMatchObject({ ok: false, code: "invalid_output" });
	});

	it("ログの書き込みが失敗しても処理は続く", async () => {
		const { deps } = fakeDeps([qwen(GOOD)]);
		deps.log = async () => {
			throw new Error("db down");
		};
		const r = await runJson({} as CloudflareBindings, opts, deps);
		expect(r.ok).toBe(true);
	});
});
