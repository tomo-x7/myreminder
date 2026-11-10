import { describe, expect, it } from "vitest";
import { noteTitleFromLine } from "./note-line";
import { parseTasks } from "./parse";

describe("1行のメモ指定", () => {
	it("語の境界があるときだけ内容を取り出す", () => {
		expect(noteTitleFromLine("メモ 提出先を確認")).toBe("提出先を確認");
		expect(noteTitleFromLine("メモ　配布資料")).toBe("配布資料");
		expect(noteTitleFromLine("メモ\t連絡事項")).toBe("連絡事項");
		expect(noteTitleFromLine("メモ: 配布資料")).toBe("配布資料");
		expect(noteTitleFromLine("メモ：配布資料")).toBe("配布資料");
	});
	it("メモリ・途中の語・動詞を誤判定しない", () => {
		for (const text of ["メモリについてのレポート", "授業のメモを提出", "メモする", "メモ帳"]) {
			expect(noteTitleFromLine(text)).toBeNull();
		}
	});
	it("明示した指定で内容がないときは空として返す", () => {
		expect(noteTitleFromLine("メモ: ")).toBe("");
		expect(noteTitleFromLine("メモ")).toBe("");
		expect(noteTitleFromLine("メモ ")).toBe("");
	});
});

it("メモ指定はAIを呼ばずに確認用候補を返し、空指定は課題を作らない", async () => {
	const context = { courses: [], busy: [], sleep: { startMin: 60, endMin: 480 } };
	const deps = {
		run: async (): Promise<never> => {
			throw new Error("AIを呼んではいけない");
		},
		log: async (): Promise<never> => {
			throw new Error("AIログを作ってはいけない");
		},
	};
	const env = {} as CloudflareBindings;
	const result = await parseTasks(env, { text: "メモ 提出先を確認", mode: "line", now: 1000 }, context, deps);
	expect(result.candidates).toHaveLength(1);
	expect(result.candidates[0]).toMatchObject({
		title: "提出先を確認",
		taskKind: "note",
		estimateMin: 0,
		completionNotify: false,
		dueAt: null,
	});
	const empty = await parseTasks(env, { text: "メモ", mode: "line", now: 1000 }, context, deps);
	expect(empty.candidates).toHaveLength(0);
	expect(empty.error).toBe("メモの内容が未入力");
});
