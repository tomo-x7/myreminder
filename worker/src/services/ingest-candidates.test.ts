import { describe, expect, it } from "vitest";
import { DAY, HOUR } from "../planner/types";
import { type CandidateTask, findCandidates, normalizeTitle } from "./ingest-candidates";

const D = jstDay();
function jstDay() {
	return Date.parse("2026-10-20T23:59:00+09:00");
}

const task = (id: string, title: string, dueAt: number, course: string[] = ["情報倫理"]): CandidateTask => ({
	id,
	title,
	dueAt,
	courseNames: course,
});
const item = (title: string, dueAt: number | null = D, courseName: string | null = "情報倫理") => ({
	title,
	courseName,
	dueAt,
});
const ids = (c: { taskId: string }[]) => c.map((x) => x.taskId);

describe("normalizeTitle", () => {
	it("NFKC・小文字・空白と記号を除く", () => {
		expect(normalizeTitle("第３回　レポート（Final）")).toBe("第3回レポートfinal");
		expect(normalizeTitle("【課題】 Report-1 / A_B")).toBe("課題report1ab");
		expect(normalizeTitle("「演習」・『問題』")).toBe("演習問題");
	});
});

describe("findCandidates", () => {
	it("正規化したタイトルが等しければ、科目や締切が違っても候補", () => {
		const c = findCandidates(item("第3回 レポート", D + 10 * DAY, "別の科目"), [
			task("a", "第３回レポート", D, ["数学"]),
		]);
		expect(c).toEqual([{ taskId: "a", reason: "same_title" }]);
	});

	it("科目が同じで締切が±1日以内なら候補。1日を超えると候補ではない", () => {
		const c = findCandidates(item("課題A"), [
			task("in", "全然別の題", D + DAY),
			task("out", "全然別の題", D + DAY + 1),
			task("early", "全然別の題", D - DAY),
		]);
		expect(ids(c).sort()).toEqual(["early", "in"]);
		expect(c.every((x) => x.reason === "near_due")).toBe(true);
	});

	it("科目が違えば、締切が近くても候補ではない", () => {
		expect(findCandidates(item("課題A"), [task("a", "別の題", D, ["数学"])])).toEqual([]);
	});

	it("科目が空なら、科目つきの条件は成り立たない", () => {
		expect(findCandidates(item("課題A", D, null), [task("a", "別の題", D, [])])).toEqual([]);
	});

	it("科目名は別名でも合う", () => {
		const c = findCandidates(item("課題A", D, "情報倫理(月2)"), [
			task("a", "別の題", D, ["情報倫理", "情報倫理(月2)"]),
		]);
		expect(ids(c)).toEqual(["a"]);
	});

	it("科目が同じで、片方がもう片方を含めば候補(短いほうが4文字以上)", () => {
		const t = [task("a", "第3回レポート", D + 10 * DAY)];
		expect(ids(findCandidates(item("第3回レポート 再提出", D + 20 * DAY), t))).toEqual(["a"]);
		// 3文字では候補にならない
		expect(findCandidates(item("提出物3", D + 20 * DAY), [task("b", "提出物", D + 10 * DAY)])).toEqual([]);
	});

	it("並びは 同じタイトル → 含む → 締切が近い。同じ条件の中では締切の差が小さい順", () => {
		const c = findCandidates(item("第3回レポート"), [
			task("near1", "別の題1", D + 2 * HOUR),
			task("contains", "第3回レポート(再提出)", D + 5 * DAY),
			task("near2", "別の題2", D + HOUR),
			task("same-far", "第3回 レポート", D + 30 * DAY, ["数学"]),
			task("same-near", "第3回レポート", D + HOUR),
		]);
		expect(ids(c)).toEqual(["same-near", "same-far", "contains"]);
	});

	it("最大3件", () => {
		const tasks = Array.from({ length: 6 }, (_, i) => task(`t${i}`, `題${i}`, D + i * HOUR));
		const c = findCandidates(item("課題A"), tasks);
		expect(ids(c)).toEqual(["t0", "t1", "t2"]);
	});

	it("締切のない項目は、締切の条件では候補にならず、同順位では後ろ", () => {
		const nodue = findCandidates(item("課題A", null), [task("a", "別の題", D)]);
		expect(nodue).toEqual([]);
		const c = findCandidates(item("課題レポート", null), [
			task("a", "課題レポート", D),
			task("b", "課題レポート", D + HOUR),
		]);
		expect(ids(c)).toEqual(["a", "b"]);
	});
});
