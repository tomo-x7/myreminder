import * as v from "valibot";
import { describe, expect, it } from "vitest";
import type { BusyBlockRow } from "./busy";
import type { ClientDeps } from "./client";
import { clampEstimate, normalizeCandidates, type ParseContext, parseTasks, snapToClassStart } from "./parse";
import { buildMessages } from "./prompts";
import { candidatesResponseSchema } from "./schemas";
import { computeStartSuggestions, findFreeSlot } from "./suggest";

const at = (s: string) => new Date(`${s}:00+09:00`).getTime();
// 現在: 2026-10-11(日) 15:30 JST
const NOW = at("2026-10-11T15:30");

const classBlock = (weekday: number, startMin: number, endMin: number, label: string): BusyBlockRow => ({
	id: `${label}${weekday}`,
	kind: "class",
	weekday,
	startMin,
	endMin,
	startAt: null,
	endAt: null,
	dateFrom: null,
	dateTo: null,
	label,
});

const ctx: ParseContext = {
	courses: [
		{ id: "c-ethics", name: "情報倫理", aliases: [] },
		{ id: "c-math", name: "数学演習", aliases: ["数演"] },
	],
	busy: [
		classBlock(1, 640, 730, "情報倫理"),
		classBlock(2, 540, 630, "数学演習"),
		classBlock(1, 780, 870, "数学演習"),
	],
	sleep: { startMin: 60, endMin: 480 },
};

const raw = (over: Record<string, unknown>) => {
	const r = v.parse(candidatesResponseSchema, {
		candidates: [
			{
				title: "レポート(2000字)",
				courseName: "情報倫理",
				category: "report",
				due: "2026-10-12T10:40",
				dueText: "来週月曜の授業前まで",
				estimateMin: 180,
				firstStep: "見出しを書く",
				confidence: 0.9,
				...over,
			},
		],
	});
	return r.candidates;
};

describe("候補のスキーマ", () => {
	it("欄ごとに寛容: 文字列の数値・'null'・不正な category", () => {
		const [c] = v.parse(candidatesResponseSchema, {
			candidates: [
				{
					title: " 演習 ",
					courseName: "null",
					category: "homework",
					due: "",
					estimateMin: "90",
					firstStep: null,
					confidence: "0.8",
				},
			],
		}).candidates;
		expect(c).toMatchObject({
			title: "演習",
			courseName: null,
			category: "other",
			due: null,
			estimateMin: 90,
			confidence: 0.8,
		});
	});

	it("壊れた候補は捨てて、残りは生かす。配列そのもの・1件のオブジェクトも受ける", () => {
		expect(
			v.parse(candidatesResponseSchema, { candidates: [{ title: "" }, { title: "ok" }] }).candidates,
		).toHaveLength(1);
		expect(v.parse(candidatesResponseSchema, [{ title: "a" }, { title: "b" }]).candidates).toHaveLength(2);
		expect(v.parse(candidatesResponseSchema, { title: "a" }).candidates).toHaveLength(1);
		expect(v.safeParse(candidatesResponseSchema, "text").success).toBe(false);
	});
});

describe("normalizeCandidates", () => {
	it("例: 『情報倫理 来週月曜の授業前までにレポート2000字』", () => {
		const [c] = normalizeCandidates(raw({}), ctx, NOW, "line");
		expect(c).toMatchObject({
			title: "レポート(2000字)",
			courseId: "c-ethics",
			courseName: "情報倫理",
			dueAt: at("2026-10-12T10:40"),
			estimateMin: 180,
			estimateSource: "ai",
			needsReview: false,
		});
	});

	it("「授業前」でモデルが時刻を取り違えても、その日の授業開始に揃える", () => {
		const [c] = normalizeCandidates(raw({ due: "2026-10-12T23:59" }), ctx, NOW, "line");
		expect(c?.dueAt).toBe(at("2026-10-12T10:40"));
	});

	it("授業のない曜日の「授業前」は確認対象", () => {
		const [c] = normalizeCandidates(raw({ due: "2026-10-13T10:40" }), ctx, NOW, "line");
		expect(c?.needsReview).toBe(true);
		expect(c?.reviewReasons.join()).toContain("授業が見つかりません");
	});

	it("24:00 は翌日 0:00。締切が読めない/過去/確信度が低いは確認対象", () => {
		const [a] = normalizeCandidates(raw({ due: "2026-10-14T24:00", dueText: "10/14 24:00" }), ctx, NOW, "line");
		expect(a?.dueAt).toBe(at("2026-10-15T00:00"));
		const [b] = normalizeCandidates(raw({ due: null }), ctx, NOW, "line");
		expect(b).toMatchObject({ dueAt: null, needsReview: true });
		const [p] = normalizeCandidates(raw({ due: "2026-10-01T10:00" }), ctx, NOW, "line");
		expect(p?.reviewReasons).toContain("締切が過去になっています");
		const [l] = normalizeCandidates(raw({ confidence: 0.69 }), ctx, NOW, "line");
		expect(l?.needsReview).toBe(true);
		const [ok] = normalizeCandidates(raw({ confidence: 0.7 }), ctx, NOW, "line");
		expect(ok?.needsReview).toBe(false);
	});

	it("未登録の科目は courseId なしで名前だけ残す。別名で結びつく", () => {
		const [u] = normalizeCandidates(raw({ courseName: "体育" }), ctx, NOW, "line");
		expect(u).toMatchObject({ courseId: null, courseName: "体育" });
		const [a] = normalizeCandidates(raw({ courseName: "数演" }), ctx, NOW, "line");
		expect(a).toMatchObject({ courseId: "c-math", courseName: "数学演習" });
	});

	it("line は1件、text は最大10件", () => {
		const many = Array.from({ length: 15 }, (_, i) => ({ title: `t${i}`, due: "2026-10-20" }));
		const parsed = v.parse(candidatesResponseSchema, { candidates: many }).candidates;
		expect(normalizeCandidates(parsed, ctx, NOW, "line")).toHaveLength(1);
		expect(normalizeCandidates(parsed, ctx, NOW, "text")).toHaveLength(10);
	});
});

describe("clampEstimate", () => {
	it("範囲に収め5分単位に丸める。なければ種類ごとの既定", () => {
		expect(clampEstimate(2, "report")).toBe(5);
		expect(clampEstimate(99999, "report")).toBe(600);
		expect(clampEstimate(47, "exercise")).toBe(45);
		expect(clampEstimate(null, "quiz")).toBe(30);
		expect(clampEstimate(0, "report")).toBe(120);
	});
});

describe("snapToClassStart", () => {
	it("dueText に「授業前」がなければ触らない", () => {
		expect(snapToClassStart(at("2026-10-12T23:59"), "月曜まで", ["情報倫理"], ctx.busy).dueAt).toBe(
			at("2026-10-12T23:59"),
		);
	});
});

describe("いつ始める?", () => {
	it("夕方なら 最短の空き・今日の夜 21:00・明日の夕方 18:00(月曜の授業は避ける必要なし)", () => {
		const s = computeStartSuggestions({ now: NOW, busy: ctx.busy });
		expect(s.map((x) => x.at)).toEqual([at("2026-10-11T15:40"), at("2026-10-11T21:00"), at("2026-10-12T18:00")]);
		expect(s[1]?.label).toBe("今日の夜 21:00");
	});

	it("21:00 を過ぎていれば 1時間後。睡眠中には置かない", () => {
		const late = at("2026-10-11T22:10");
		const s = computeStartSuggestions({ now: late, busy: [] });
		expect(s[0]?.at).toBe(at("2026-10-11T22:20"));
		// 23:30 → 1時間後は 0:30 で睡眠(1:00〜)にかかる枠なので出さない。翌朝8:00以降も今日分には含めない
		const s2 = computeStartSuggestions({ now: at("2026-10-11T23:30"), busy: [] });
		expect(s2.some((x) => x.at >= at("2026-10-12T00:30") && x.at < at("2026-10-12T08:00"))).toBe(false);
	});

	it("授業と重なる枠は避けて、終わった直後を出す", () => {
		// 月曜は 10:40-12:10 と 13:00-14:30 の授業。60分の枠が取れるのは 14:30 以降
		const mon = at("2026-10-12T10:00");
		const s = computeStartSuggestions({ now: mon, busy: ctx.busy });
		expect(s[0]?.at).toBe(at("2026-10-12T14:30"));
	});

	it("findFreeSlot は5分単位で、区間を飛び越える", () => {
		expect(
			findFreeSlot(
				at("2026-10-11T10:01"),
				3_600_000,
				[{ start: at("2026-10-11T10:30"), end: at("2026-10-11T11:00") }],
				at("2026-10-12T00:00"),
			),
		).toBe(at("2026-10-11T11:00"));
	});
});

describe("プロンプト", () => {
	it("現在日時・暦・時間割・科目を含む", () => {
		const [system, user] = buildMessages("line", "情報倫理 来週月曜の授業前までにレポート", {
			now: NOW,
			courses: ctx.courses,
			busy: ctx.busy,
		});
		expect(system?.content).toContain("2026-10-11(日) 15:30");
		expect(system?.content).toContain("2026-10-12(月) 明日・来週");
		expect(system?.content).toContain("月: 10:40-12:10 情報倫理 / 13:00-14:30 数学演習");
		expect(system?.content).toContain("数学演習(別名: 数演)");
		expect(user?.content).toContain("来週月曜の授業前までにレポート");
	});
});

describe("parseTasks(記録した出力でパイプラインを通す)", () => {
	const deps = (content: string): ClientDeps => ({
		run: async () => ({ choices: [{ message: { role: "assistant", content } }] }),
		log: async () => {},
	});

	it("line: think 付きの出力 → 候補1件+開始候補", async () => {
		const out = `<think>\n\n</think>\n{"candidates":[{"title":"レポート(2000字)","courseName":"情報倫理","category":"report","due":"2026-10-12T23:59","dueText":"来週月曜の授業前まで","estimateMin":180,"firstStep":null,"confidence":0.92}]}`;
		const r = await parseTasks({} as CloudflareBindings, { text: "x", mode: "line", now: NOW }, ctx, deps(out));
		expect(r.error).toBeNull();
		expect(r.candidates[0]?.dueAt).toBe(at("2026-10-12T10:40"));
		expect(r.startSuggestions.length).toBeGreaterThan(0);
	});

	it("失敗時は candidates 空 + error(開始候補は返す)", async () => {
		const r = await parseTasks(
			{} as CloudflareBindings,
			{ text: "x", mode: "line", now: NOW },
			ctx,
			deps("わかりません"),
		);
		expect(r.candidates).toEqual([]);
		expect(r.error).toContain("手入力");
	});

	it("text: 課題なしは正しい答え(error は『見つかりませんでした』)", async () => {
		const r = await parseTasks(
			{} as CloudflareBindings,
			{ text: "x", mode: "text", now: NOW },
			ctx,
			deps('{"candidates":[]}'),
		);
		expect(r.candidates).toEqual([]);
		expect(r.error).toBe("課題が見つかりませんでした");
	});
});
