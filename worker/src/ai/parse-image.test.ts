import { describe, expect, it } from "vitest";
import { parse } from "../routes/parse";
import type { BusyBlockRow } from "./busy";
import type { ClientDeps } from "./client";
import type { ParseContext } from "./parse";
import { IMAGE_FALLBACK_MODEL, IMAGE_PRIMARY_MODEL, MAX_IMAGE_BYTES, parseImage, toDataUri } from "./parse-image";
import { buildImageMessages } from "./prompts";

const at = (s: string) => new Date(`${s}:00+09:00`).getTime();
const NOW = at("2026-10-11T15:30");
const monday: BusyBlockRow = {
	id: "b1",
	kind: "class",
	weekday: 1,
	startMin: 640,
	endMin: 730,
	startAt: null,
	endAt: null,
	dateFrom: null,
	dateTo: null,
	label: "情報倫理",
};
const ctx: ParseContext = {
	courses: [{ id: "c-ethics", name: "情報倫理", aliases: [] }],
	busy: [monday],
	sleep: { startMin: 60, endMin: 480 },
};

// Gemma 4(OpenAI 互換)が返す形を想定したサンプル
const GOOD =
	'{"candidates":[{"title":"レポート(2000字)","courseName":"情報倫理","category":"report","due":"2026-10-12T10:40","dueText":"次回授業の前まで","estimateMin":180,"firstStep":null,"confidence":0.85},{"title":"第3回演習","courseName":null,"category":"exercise","due":null,"dueText":null,"estimateMin":null,"firstStep":null,"confidence":0.5}]}';
const chat = (content: string) => ({ choices: [{ message: { role: "assistant", content } }] });

function fakeDeps(responses: (unknown | Error)[]) {
	const calls: { model: string; input: Record<string, unknown> }[] = [];
	const logs: { purpose: string; inputText: string }[] = [];
	const deps: ClientDeps = {
		run: async (model, input) => {
			calls.push({ model, input });
			const r = responses[calls.length - 1];
			if (r instanceof Error) throw r;
			return r;
		},
		log: async (e) => {
			logs.push({ purpose: e.purpose, inputText: e.inputText });
		},
	};
	return { deps, calls, logs };
}

describe("toDataUri", () => {
	it("base64 のデータ URI にする(チャンクをまたぐ大きさでも壊れない)", () => {
		expect(toDataUri(new Uint8Array([104, 105]), "image/jpeg")).toBe("data:image/jpeg;base64,aGk=");
		const big = new Uint8Array(0x8000 * 2 + 5).fill(65);
		const uri = toDataUri(big, "image/png");
		expect(atob(uri.split(",")[1] ?? "")).toBe("A".repeat(big.length));
	});
});

describe("buildImageMessages", () => {
	it("system に暦・時間割・画像用ルール、user に text + image_url", () => {
		const [system, user] = buildImageMessages("data:image/jpeg;base64,AAAA", { now: NOW, ...ctx });
		expect(system?.content).toContain("2026-10-12(月) 明日・来週");
		expect(system?.content).toContain("月: 10:40-12:10 情報倫理");
		expect(system?.content).toContain("講義スライド");
		expect(user?.content).toEqual([
			{ type: "text", text: expect.stringContaining("画像") },
			{ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } },
		]);
	});
});

describe("parseImage(スタブした AI の出力でパイプラインを通す)", () => {
	const input = { bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg", now: NOW };

	it("文章の解析と同じ形の結果。日付は解決され、締切のないものは確認が必要", async () => {
		const { deps, calls, logs } = fakeDeps([chat(GOOD)]);
		const r = await parseImage({} as CloudflareBindings, input, ctx, deps);
		expect(r.error).toBeNull();
		expect(r.now).toBe(NOW);
		expect(r.startSuggestions.length).toBeGreaterThan(0);
		expect(r.candidates).toHaveLength(2);
		expect(r.candidates[0]).toMatchObject({
			courseId: "c-ethics",
			dueAt: at("2026-10-12T10:40"),
			needsReview: false,
		});
		expect(r.candidates[1]).toMatchObject({ dueAt: null, needsReview: true });
		// 主力 Gemma 4。画像は data URI で渡り、ログには base64 が入らない
		expect(calls[0]?.model).toBe(IMAGE_PRIMARY_MODEL);
		expect(calls[0]?.input.chat_template_kwargs).toEqual({ enable_thinking: false });
		const userContent = (calls[0]?.input.messages as { content: unknown }[])[1]?.content as { type: string }[];
		expect(userContent.map((p) => p.type)).toEqual(["text", "image_url"]);
		expect(logs).toEqual([{ purpose: "parse_image", inputText: "(画像 image/jpeg 0KB)" }]);
	});

	it("壊れた出力 → OpenAI 形式の json_schema で再試行 → だめなら予備の Qwen3.8", async () => {
		const { deps, calls } = fakeDeps([chat("読み取れません"), chat("まだ"), chat(GOOD)]);
		const r = await parseImage({} as CloudflareBindings, input, ctx, deps);
		expect(r.candidates).toHaveLength(2);
		expect(calls.map((c) => c.model)).toEqual([IMAGE_PRIMARY_MODEL, IMAGE_PRIMARY_MODEL, IMAGE_FALLBACK_MODEL]);
		expect(calls[0]?.input.response_format).toBeUndefined();
		expect(calls[1]?.input.response_format).toMatchObject({
			type: "json_schema",
			json_schema: { name: "candidates", schema: { type: "object" } },
		});
		expect(calls[2]?.input.max_tokens).toBe(1500);
	});

	it("全部失敗 → candidates 空 + error。課題なしは『写真に課題なし』", async () => {
		const failed = await parseImage(
			{} as CloudflareBindings,
			input,
			ctx,
			fakeDeps([chat("x"), chat("x"), chat("x")]).deps,
		);
		expect(failed.candidates).toEqual([]);
		expect(failed.error).toBe("AI の出力が読み取れない");
		const empty = await parseImage(
			{} as CloudflareBindings,
			input,
			ctx,
			fakeDeps([chat('{"candidates":[]}')]).deps,
		);
		expect(empty.error).toBe("写真に課題なし");
	});
});

describe("POST /image(DB に触れる前の検査)", () => {
	const post = (file: File) => {
		const form = new FormData();
		form.append("image", file);
		return parse.request("/image", { method: "POST", body: form }, {});
	};

	it("上限を超えたら 413", async () => {
		const res = await post(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "a.jpg", { type: "image/jpeg" }));
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "too_large", message: "画像は 1.5MB まで" });
	});

	it("画像以外は 415", async () => {
		const res = await post(new File(["hello"], "a.txt", { type: "text/plain" }));
		expect(res.status).toBe(415);
		expect(await res.json()).toMatchObject({ error: "unsupported_media_type" });
	});

	it("image フィールドがなければ 400", async () => {
		const res = await parse.request("/image", { method: "POST", body: new FormData() }, {});
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ error: "invalid_input", issues: [expect.stringContaining("image")] });
	});
});
