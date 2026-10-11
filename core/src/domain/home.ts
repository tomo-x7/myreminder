// ホームの表示用の値(計画・タスク・科目から導く)
import type { Course, Plan, PlanTask, Task } from "../api/types";
import { jstParts } from "./date";
import { bottleneckText, pickNext } from "./schedule";
import { courseById } from "./task-list";

/** 月曜は新しい週のはじまりなので、先週のふりかえりを目立たせる */
export const isJstMonday = (now: number) => jstParts(now).weekday === 1;

export type HomeView = {
	/** 次の1件(リスクが一番高いもの) */
	next: PlanTask | undefined;
	nextCourse: Course | undefined;
	/** 期限切れもなく、次の1件もない */
	nothingToDo: boolean;
	/** 未提出(done)の数 */
	awaitingSubmit: number;
	/** 次の1件のほかの未完了の数 */
	others: number;
	/** 山場の表示と、余裕が負か */
	bottleneck: { text: string; short: boolean } | null;
	monday: boolean;
};

export function homeView(plan: Plan, tasks: readonly Task[], courses: readonly Course[], now: number): HomeView {
	const next = pickNext(plan.tasks);
	return {
		next,
		nextCourse: next ? courseById(courses, next.courseId) : undefined,
		// 期限切れだけが残っているときは「未完了なし」と言わない(期限切れの欄が主役)
		nothingToDo: !next && plan.overdue.length === 0,
		awaitingSubmit: tasks.filter((t) => t.status === "done").length,
		others: plan.tasks.length - (next ? 1 : 0),
		bottleneck: plan.bottleneck
			? { text: bottleneckText(plan.bottleneck, now), short: plan.bottleneck.slackUsual < 0 }
			: null,
		monday: isJstMonday(now),
	};
}
