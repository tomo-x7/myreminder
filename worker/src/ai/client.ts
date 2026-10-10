// Workers AI を呼んで JSON を取り出す(仕様: ai-docs/plan.md §3.10)
// 主力モデルで2回(2回目は json_schema 付き)→ だめなら予備モデルを JSON mode で1回。全試行を ai_log に残す。
// 呼び出し側には例外を投げず、型付きの失敗を返す
import * as v from "valibot";
import { getDb } from "../db";
import { aiLog } from "../db/schema";

export const PRIMARY_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
export const FALLBACK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** 画像付きメッセージ(OpenAI 互換)。url は data:image/jpeg;base64,… */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

export type RunJsonFailure = {
	ok: false;
	/** quota: 無料枠切れ。invalid_output: 全試行で出力が壊れていた。upstream: Workers AI のエラー */
	code: "quota" | "invalid_output" | "upstream";
	error: string;
};
export type RunJsonSuccess<T> = { ok: true; data: T; model: string };
export type RunJsonResult<T> = RunJsonSuccess<T> | RunJsonFailure;

export type RunJsonOptions<S extends v.GenericSchema> = {
	/** ai_log.purpose */
	purpose: string;
	messages: ChatMessage[];
	schema: S;
	/** JSON mode に渡す JSON Schema */
	jsonSchema: object;
	/** ai_log.input_text。省略時は最後の user メッセージ(画像付きのときは必ず渡す。base64 をログに入れない) */
	inputText?: string;
	maxTokens?: number;
	/** 試行の順番。省略時は文章用(主力2回 → 予備1回) */
	attempts?: Attempt[];
};

/** テストで差し替えるための口 */
export type ClientDeps = {
	run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
	log: (entry: {
		purpose: string;
		inputText: string;
		output: unknown;
		model: string;
		status: "ok" | "error";
		error: string | null;
	}) => Promise<void>;
};

export function defaultDeps(env: CloudflareBindings): ClientDeps {
	return {
		// モデル名ごとの型定義があるので、ここだけ緩める
		run: (model, input) =>
			(env.AI as unknown as { run: (m: string, i: unknown) => Promise<unknown> }).run(model, input),
		log: async (e) => {
			await getDb(env)
				.insert(aiLog)
				.values({
					purpose: e.purpose,
					inputText: e.inputText.slice(0, 10_000),
					output: e.output ?? null,
					model: e.model,
					status: e.status,
					error: e.error,
					createdAt: Date.now(),
				});
		},
	};
}

/** <think>…</think> を取り除く。閉じていない <think> は途中で切れているので null */
export function stripThink(text: string): string | null {
	const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
	if (/<think>/i.test(stripped)) return null;
	return stripped.replace(/<\/think>/gi, "").trim();
}

/** 文字列から最初の { … } か [ … ] の塊を、文字列リテラルを考慮して切り出す */
function extractBalanced(text: string): string | null {
	const start = text.search(/[{[]/);
	if (start < 0) return null;
	const stack: string[] = [];
	let inString = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (ch === "\\") i++;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
		else if (ch === "}" || ch === "]") {
			if (stack.pop() !== ch) return null;
			if (stack.length === 0) return text.slice(start, i + 1);
		}
	}
	return null;
}

/** モデルの出力テキストから JSON を取り出す(think 除去・コードフェンス・前後の説明文に耐える)。失敗は undefined */
export function parseJsonLoose(raw: string): unknown | undefined {
	const text = stripThink(raw);
	if (text === null || text === "") return undefined;
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
	const candidates = [text, fenced?.[1]?.trim(), extractBalanced(text)];
	for (const c of candidates) {
		if (!c) continue;
		try {
			return JSON.parse(c);
		} catch {
			// 次の候補へ
		}
	}
	return undefined;
}

/**
 * Workers AI の返り値の形の違いを吸収する。
 * - qwen3(OpenAI 互換): { choices: [{ message: { content, reasoning_content? } }] }
 * - llama 系: { response: string | object }。JSON mode では response がパース済みオブジェクトで来ることがある
 * - 文字列そのまま
 */
export function extractModelOutput(result: unknown): { text: string } | { json: unknown } | null {
	if (typeof result === "string") return { text: result };
	if (!result || typeof result !== "object") return null;
	const r = result as Record<string, unknown>;
	const choice = Array.isArray(r.choices) ? (r.choices[0] as Record<string, unknown> | undefined) : undefined;
	const content = (choice?.message as Record<string, unknown> | undefined)?.content;
	if (typeof content === "string" && content.trim() !== "") return { text: content };
	if (typeof choice?.text === "string" && choice.text.trim() !== "") return { text: choice.text };
	if (typeof r.response === "string") return { text: r.response };
	if (r.response && typeof r.response === "object") return { json: r.response };
	return null;
}

const QUOTA_RE = /neurons|allocation|quota|rate.?limit|too many requests|\b429\b|4006/i;

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 500);

export type Attempt = {
	model: string;
	jsonMode: boolean;
	temperature: number;
	/** 最後の user メッセージ(文字列)に /no_think を足す。Qwen3(30B)の思考モードを切るソフトスイッチ */
	noThinkSwitch?: boolean;
	/** response_format.json_schema の包み方。raw は JSON Schema そのまま(Qwen3-30B・Llama 3.3)、openai は {name, schema}(Gemma 4・Qwen3.8) */
	schemaStyle?: "raw" | "openai";
	/** そのまま入力に足す(chat_template_kwargs など) */
	extra?: Record<string, unknown>;
	maxTokens?: number;
};

const ATTEMPTS: Attempt[] = [
	{ model: PRIMARY_MODEL, jsonMode: false, temperature: 0.1, noThinkSwitch: true },
	// 再試行は json_schema を付けて、出力の形を縛る
	{ model: PRIMARY_MODEL, jsonMode: true, temperature: 0, noThinkSwitch: true },
	{ model: FALLBACK_MODEL, jsonMode: true, temperature: 0 },
];

function responseFormat(a: Attempt, jsonSchema: object) {
	return {
		type: "json_schema",
		json_schema: a.schemaStyle === "openai" ? { name: "candidates", schema: jsonSchema } : jsonSchema,
	};
}

export async function runJson<S extends v.GenericSchema>(
	env: CloudflareBindings,
	opts: RunJsonOptions<S>,
	deps: ClientDeps = defaultDeps(env),
): Promise<RunJsonResult<v.InferOutput<S>>> {
	const lastUser = [...opts.messages].reverse().find((m) => m.role === "user")?.content;
	const inputText = opts.inputText ?? (typeof lastUser === "string" ? lastUser : "");
	let lastError = "";
	let code: RunJsonFailure["code"] = "invalid_output";

	const log = async (a: Attempt, status: "ok" | "error", output: unknown, error: string | null) => {
		try {
			await deps.log({ purpose: opts.purpose, inputText, output, model: a.model, status, error });
		} catch {
			// ログの失敗で本処理を止めない
		}
	};

	for (const attempt of opts.attempts ?? ATTEMPTS) {
		let raw: unknown;
		try {
			const messages = opts.messages.map((m) => ({ ...m }));
			if (attempt.noThinkSwitch) {
				// 思考モードを切るソフトスイッチ(切れていなくても stripThink で落とす)
				const last = messages.findLast((m) => m.role === "user");
				if (last && typeof last.content === "string") last.content = `${last.content}\n/no_think`;
			}
			raw = await deps.run(attempt.model, {
				messages,
				max_tokens: attempt.maxTokens ?? opts.maxTokens ?? 2000,
				temperature: attempt.temperature,
				...(attempt.jsonMode ? { response_format: responseFormat(attempt, opts.jsonSchema) } : {}),
				...attempt.extra,
			});
		} catch (e) {
			lastError = errorMessage(e);
			// 「JSON Mode couldn't be met」を含め、次の試行に回す。無料枠切れだけは回しても無駄なので打ち切る
			const quota = QUOTA_RE.test(lastError);
			code = quota ? "quota" : "upstream";
			await log(attempt, "error", null, lastError);
			if (quota) return { ok: false, code, error: lastError };
			continue;
		}

		const out = extractModelOutput(raw);
		const json = out === null ? undefined : "json" in out ? out.json : parseJsonLoose(out.text);
		if (json === undefined) {
			lastError = out === null ? "empty_output" : "invalid_json";
			code = "invalid_output";
			await log(attempt, "error", { raw: truncate(raw) }, lastError);
			continue;
		}

		const parsed = v.safeParse(opts.schema, json);
		if (!parsed.success) {
			lastError = `schema_mismatch: ${parsed.issues[0]?.message ?? ""}`;
			code = "invalid_output";
			await log(attempt, "error", { raw: truncate(raw) }, lastError);
			continue;
		}
		await log(attempt, "ok", json, null);
		return { ok: true, data: parsed.output, model: attempt.model };
	}
	return { ok: false, code, error: lastError };
}

function truncate(raw: unknown): unknown {
	const s = typeof raw === "string" ? raw : JSON.stringify(raw);
	return s && s.length > 8000 ? `${s.slice(0, 8000)}…` : raw;
}
