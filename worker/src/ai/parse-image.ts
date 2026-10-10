// 講義スライドなどの写真 → 確認カード用の候補(仕様: ai-docs/plan.md §3.2、決定ログ #29)
// 画像対応モデルに、文字の読み取りと課題の抽出を1回でやらせる(Gemma 4 は json_schema を使える)。
// 返す形は文章の解析(parseTasks)と同じ ParseResult なので、画面の確認カードはそのまま使える
import { type Attempt, type ClientDeps, runJson } from "./client";
import { failureMessage, normalizeCandidates, type ParseContext, type ParseResult } from "./parse";
import { buildImageMessages } from "./prompts";
import { candidatesJsonSchema, candidatesResponseSchema } from "./schemas";
import { computeStartSuggestions } from "./suggest";

export const IMAGE_PRIMARY_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const IMAGE_FALLBACK_MODEL = "@cf/qwen/qwen3.8-27b";

/** アップロードの上限。クライアントで 1280px・JPEG 0.8 に縮めるので、通常は 300KB 前後 */
export const MAX_IMAGE_BYTES = 1_500_000;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// 思考は両モデルとも chat_template_kwargs で切る(公式チュートリアルと同じ書き方)。
// 予備の Qwen3.8 は出力が高い(29万 neurons/100万トークン)ので、出力の上限を絞る
const THINKING_OFF = { chat_template_kwargs: { enable_thinking: false } };
export const IMAGE_ATTEMPTS: Attempt[] = [
	{ model: IMAGE_PRIMARY_MODEL, jsonMode: false, temperature: 0.1, extra: THINKING_OFF },
	{ model: IMAGE_PRIMARY_MODEL, jsonMode: true, temperature: 0, schemaStyle: "openai", extra: THINKING_OFF },
	{
		model: IMAGE_FALLBACK_MODEL,
		jsonMode: true,
		temperature: 0,
		schemaStyle: "openai",
		extra: THINKING_OFF,
		maxTokens: 1500,
	},
];

/** Workers の base64(Uint8Array → data URI)。大きな配列を spread すると引数の上限を超えるので、チャンクに分ける */
export function toDataUri(bytes: Uint8Array, mime: string): string {
	let binary = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return `data:${mime};base64,${btoa(binary)}`;
}

export async function parseImage(
	env: CloudflareBindings,
	input: { bytes: Uint8Array; mime: string; now?: number },
	ctx: ParseContext,
	deps?: ClientDeps,
): Promise<ParseResult> {
	const now = input.now ?? Date.now();
	const startSuggestions = computeStartSuggestions({ now, busy: ctx.busy, sleep: ctx.sleep });
	const messages = buildImageMessages(toDataUri(input.bytes, input.mime), {
		now,
		courses: ctx.courses,
		busy: ctx.busy,
	});

	const result = await runJson(
		env,
		{
			purpose: "parse_image",
			messages,
			schema: candidatesResponseSchema,
			jsonSchema: candidatesJsonSchema,
			// base64 はログに入れない
			inputText: `(画像 ${input.mime} ${Math.round(input.bytes.length / 1024)}KB)`,
			maxTokens: 3000,
			attempts: IMAGE_ATTEMPTS,
		},
		deps,
	);
	if (!result.ok) {
		return { candidates: [], startSuggestions, now, error: failureMessage(result.code) };
	}
	const candidates = normalizeCandidates(result.data.candidates, ctx, now, "image");
	return {
		candidates,
		startSuggestions,
		now,
		error: candidates.length === 0 ? "写真から課題が見つかりませんでした" : null,
	};
}
