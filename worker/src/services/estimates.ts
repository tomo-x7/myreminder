// 見積もりの学習サンプルの組み立てと、入力欄に出す過去の実績(仕様: ai-docs/specs/planner.md §1)
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { sessions, tasks } from "../db/schema";
import { type EstimateKey, referenceSamples, type Sample } from "../planner/estimate";
import type { Category, Minutes, Ms } from "../planner/types";
import { actualForSample, type FinishedSession, groupByTask } from "./planning-helpers";

/** 入力欄に出す実績の件数 */
const REFERENCE_LIMIT = 3;

export type SampleRow = Sample & { taskId: string; title: string };

export type SampleTask = {
	id: string;
	title: string;
	category: Category;
	courseId: string | null;
	seriesId: string | null;
	estimateMin: Minutes;
	status: string;
};

/**
 * 見積もりの学習サンプル: 提出済み・完了のうち、確認待ちの作業記録を含まず、確定済みの実績があるタスク。
 * 計画の学習と入力欄の実績で同じものを使う
 */
export function buildSampleRows(
	taskRows: readonly SampleTask[],
	sessionsByTask: ReadonlyMap<string, FinishedSession[]>,
): SampleRow[] {
	const rows: SampleRow[] = [];
	for (const t of taskRows) {
		if (t.status !== "submitted" && t.status !== "done") continue;
		const actual = actualForSample(sessionsByTask.get(t.id) ?? []);
		if (!actual) continue;
		rows.push({
			taskId: t.id,
			title: t.title,
			category: t.category,
			courseId: t.courseId,
			seriesId: t.seriesId,
			estimateMin: t.estimateMin,
			...actual,
		});
	}
	return rows;
}

export type EstimateReference = {
	level: "series" | "course" | "category" | null;
	items: { taskId: string; title: string; estimateMin: Minutes; actualMin: Minutes; completedAt: Ms }[];
};

/** 同じ繰り返し・科目・種類の、直近の実績。サンプルがなければ level は null */
export async function computeReference(db: Db, key: EstimateKey): Promise<EstimateReference> {
	const [taskRows, sessionRows] = await Promise.all([
		db
			.select()
			.from(tasks)
			.where(inArray(tasks.status, ["submitted", "done"])),
		db.select().from(sessions).where(eq(sessions.kind, "actual")),
	]);
	// 時刻まで同じ実績があっても結果が変わらないよう、id 順にしておく(referenceSamples の並べ替えは安定)
	const rows = buildSampleRows(taskRows, groupByTask(sessionRows)).sort((a, b) => (a.taskId < b.taskId ? -1 : 1));
	const { level, items } = referenceSamples(rows, key, REFERENCE_LIMIT);
	return {
		level,
		items: items.map((r) => ({
			taskId: r.taskId,
			title: r.title,
			estimateMin: r.estimateMin,
			actualMin: r.actualMin,
			completedAt: r.completedAt,
		})),
	};
}
