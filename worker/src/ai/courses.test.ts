import { describe, expect, it } from "vitest";
import { labelMatchesCourse, matchCourse, normalizeName } from "./courses";

const courses = [
	{ id: "a", name: "情報倫理", aliases: ["Information Ethics"] },
	{ id: "b", name: "線形代数学Ⅰ", aliases: ["線形代数1"] },
	{ id: "c", name: "線形代数学Ⅱ", aliases: [] },
	{ id: "d", name: "英語", aliases: [] },
];

describe("matchCourse", () => {
	it("完全一致(大文字小文字・全角半角・空白を無視)", () => {
		expect(matchCourse("情報 倫理", courses)?.id).toBe("a");
		expect(matchCourse("information ethics", courses)?.id).toBe("a");
		expect(matchCourse("INFORMATION　ETHICS", courses)?.id).toBe("a");
		expect(matchCourse("線形代数学Ⅱ", courses)?.id).toBe("c");
	});

	it("別名で一致する(NFKC でローマ数字・全角数字も揃う)", () => {
		expect(matchCourse("線形代数１", courses)?.id).toBe("b");
	});

	it("部分一致は、十分長く紛らわしくない場合だけ", () => {
		expect(matchCourse("情報倫理(月3)", courses)?.id).toBe("a");
		// 2文字の科目名は部分一致させない
		expect(matchCourse("英語表現", courses)).toBeNull();
	});

	it("同点で決められない部分一致は null(取り違えるより自由入力のまま見せる)", () => {
		expect(matchCourse("線形代数学", courses)).toBeNull();
	});

	it("空・未登録は null", () => {
		expect(matchCourse(null, courses)).toBeNull();
		expect(matchCourse("", courses)).toBeNull();
		expect(matchCourse("体育", courses)).toBeNull();
	});
});

describe("labelMatchesCourse", () => {
	it("時間割の表示名に限定語が付いていても科目に結びつく", () => {
		expect(labelMatchesCourse("情報倫理", ["情報倫理"])).toBe(true);
		expect(labelMatchesCourse("3限 情報倫理", ["情報倫理"])).toBe(true);
		expect(labelMatchesCourse("英語", ["情報倫理"])).toBe(false);
	});
});

it("normalizeName", () => {
	expect(normalizeName("Ａ・Ｂ (c)")).toBe("abc");
});
