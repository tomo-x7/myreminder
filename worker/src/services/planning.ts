// 計画サービス: DB の内容を planner の入力に組み立てて、plan() / slackGain() を呼ぶ。
// 仕様: ai-docs/plan.md §3.3〜§3.6、ai-docs/specs/planner.md
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { busyBlocks, sessions, tasks } from "../db/schema";
import { expandBusyBlocks } from "../planner/busy";
import { buildCapacity, type CapacityInput } from "../planner/capacity";
import { fitEstimateModel, planningMultiplier, type Sample, uncertainty } from "../planner/estimate";
import { type PlanOutput, type PlanTask, plan } from "../planner/schedule";
import { type SlackGain, slackGain } from "../planner/slack-gain";
import { DAY, MINUTE, type Minutes, type Ms } from "../planner/types";
import { learnUsualCapacity } from "../planner/usual-capacity";
import { getSettings } from "../settings";
import {
	activityDayOf,
	actualForSample,
	dailyWorkForLearning,
	latestProgress,
	remainingFraction,
	workedMinutesByActivityDay,
	workedToday,
} from "./planning-helpers";

const MIN_HORIZON_DAYS = 14;
/** 打ち間違いの締切(2099年など)で計算が重くならないための上限。これより先の締切のタスクは計画に載せない */
const MAX_HORIZON_DAYS = 180;
const MARGIN_RATIO = 0.5;
const LEARNING_WINDOW_DAYS = 28;
/** 見積もりの不確かさがこれを超え、かつ作業記録がまだないタスクを uncertain とする */
const UNCERTAIN_THRESHOLD = 0.6;
const DEFAULT_SPARE_MAX = 90;
const SPARE_MIN = 30;

export type TaskMeta = {
	id: string;
	title: string;
	courseId: string | null;
	dueAt: Ms;
	remainingP80: Minutes;
};

export type PlanContext = {
	now: Ms;
	capacityInput: CapacityInput;
	planTasks: PlanTask[];
	meta: Map<string, TaskMeta>;
};

/** DB を読んで、計画の入力を組み立てる。select は固定回数(タスクごとのクエリはない) */
export async function buildPlanContext(db: Db, now: Ms): Promise<PlanContext> {
	const [taskRows, sessionRows, busyRows, cfg] = await Promise.all([
		db
			.select()
			.from(tasks)
			.where(inArray(tasks.status, ["todo", "doing", "done", "submitted"])),
		db.select().from(sessions).where(eq(sessions.kind, "actual")),
		db.select().from(busyBlocks),
		getSettings(db),
	]);

	const sessionsByTask = new Map<string, (typeof sessionRows)[number][]>();
	for (const s of sessionRows) {
		const list = sessionsByTask.get(s.taskId);
		if (list) list.push(s);
		else sessionsByTask.set(s.taskId, [s]);
	}

	const wakeMin = cfg.sleep.endMin;
	const today = activityDayOf(now, wakeMin);

	// 普段のキャパ: 確定済みの終了した記録を活動日ごとに集計して学習。直近28日より前は渡さない
	const windowStart = now - (LEARNING_WINDOW_DAYS + 2) * DAY;
	const confirmedSpans = sessionRows.filter(
		(s) => s.review === "confirmed" && s.endAt !== null && s.endAt > windowStart,
	);
	const usual = learnUsualCapacity(dailyWorkForLearning(workedMinutesByActivityDay(confirmedSpans, wakeMin), today), {
		windowDays: LEARNING_WINDOW_DAYS,
		defaults: cfg.usualCapacityDefaults,
	});

	// 今日の作業分: 確定済みの終了した記録+作業中(now まで)
	const worked = workedToday(
		sessionRows.filter((s) => s.endAt === null || s.review === "confirmed"),
		wakeMin,
		now,
	);

	// 見積もりの学習: 提出済み・完了のうち、確認待ちを含まず、確定済みの実績があるタスク
	const samples: Sample[] = [];
	for (const t of taskRows) {
		if (t.status !== "submitted" && t.status !== "done") continue;
		const actual = actualForSample(sessionsByTask.get(t.id) ?? []);
		if (actual) samples.push({ category: t.category, estimateMin: t.estimateMin, ...actual });
	}
	const model = fitEstimateModel(samples);

	// 計画に載せるタスク: 未完了(todo/doing)で、残りがあるもの。done は作業が終わっているので残り0
	const open = taskRows.filter((t) => t.status === "todo" || t.status === "doing");
	const horizonDays = Math.min(
		MAX_HORIZON_DAYS,
		Math.max(MIN_HORIZON_DAYS, Math.ceil((Math.max(now, ...open.map((t) => t.dueAt)) - now) / DAY) + 1),
	);
	const horizonEnd = now + horizonDays * DAY;

	const planTasks: PlanTask[] = [];
	const meta = new Map<string, TaskMeta>();
	for (const t of open) {
		if (t.dueAt > horizonEnd) continue;
		const own = sessionsByTask.get(t.id) ?? [];
		const confirmed = own.filter((s) => s.review === "confirmed");
		const nominal = t.estimateMin * remainingFraction(latestProgress(confirmed));
		if (nominal <= 0) continue;
		const remainingP80 = nominal * planningMultiplier(model, t.category, t.estimateMin);
		planTasks.push({
			id: t.id,
			dueAt: t.dueAt,
			releaseAt: t.releaseAt ?? undefined,
			remainingP80,
			minBlock: t.minBlockMin,
			plannedStartAt: t.plannedStartAt ?? undefined,
			uncertain: own.length === 0 && uncertainty(model, t.category, t.estimateMin) > UNCERTAIN_THRESHOLD,
		});
		meta.set(t.id, { id: t.id, title: t.title, courseId: t.courseId, dueAt: t.dueAt, remainingP80 });
	}

	return {
		now,
		capacityInput: {
			now,
			horizonDays,
			busy: expandBusyBlocks(busyRows, now, horizonEnd),
			sleep: cfg.sleep,
			usual,
			workedToday: worked,
		},
		planTasks,
		meta,
	};
}

export type TaskPlanView = PlanOutput["tasks"][number] & {
	title: string;
	courseId: string | null;
	dueAt: Ms;
	remainingP80: Minutes;
};

export type PlanResult = {
	now: Ms;
	bottleneck: PlanOutput["bottleneck"];
	deadlines: PlanOutput["deadlines"];
	tasks: Omit<TaskPlanView, "blocks">[];
	overdue: TaskMeta[];
	dropCandidates: TaskMeta[];
};

const view = (ctx: PlanContext, id: string): TaskMeta => ctx.meta.get(id) as TaskMeta;

/** 計画を計算して、API 向けにタスクの情報を足す */
export async function computePlan(db: Db, now: Ms): Promise<PlanResult> {
	const ctx = await buildPlanContext(db, now);
	const out = plan({
		now,
		tasks: ctx.planTasks,
		capacity: buildCapacity(ctx.capacityInput),
		marginRatio: MARGIN_RATIO,
	});
	return {
		now,
		bottleneck: out.bottleneck,
		deadlines: out.deadlines,
		tasks: out.tasks.map(({ blocks: _blocks, ...t }) => {
			const m = view(ctx, t.id);
			return { ...t, title: m.title, courseId: m.courseId, dueAt: m.dueAt, remainingP80: m.remainingP80 };
		}),
		overdue: out.overdue.map((id) => view(ctx, id)),
		dropCandidates: out.dropCandidates.map((id) => view(ctx, id)),
	};
}

export type SlackItem = SlackGain & { title: string; dueAt: Ms; remainingP80: Minutes };

/**
 * 余裕リスト。候補はリスクが relaxed のタスク。
 * spareMin の既定は次の空き時間の長さ(30〜90分)
 */
export async function computeSlackList(
	db: Db,
	now: Ms,
	spareMin?: Minutes,
): Promise<{ spareMin: Minutes; items: SlackItem[] }> {
	const ctx = await buildPlanContext(db, now);
	const capacity = buildCapacity(ctx.capacityInput);
	const spare =
		spareMin ??
		Math.min(
			DEFAULT_SPARE_MAX,
			Math.max(
				SPARE_MIN,
				Math.floor(capacity.free.length > 0 ? (capacity.free[0].end - capacity.free[0].start) / MINUTE : 0),
			),
		);
	const out = plan({ now, tasks: ctx.planTasks, capacity, marginRatio: MARGIN_RATIO });
	const items = slackGain({
		capacityInput: ctx.capacityInput,
		tasks: ctx.planTasks,
		marginRatio: MARGIN_RATIO,
		candidateIds: out.tasks.filter((t) => t.risk === "relaxed").map((t) => t.id),
		spareMin: spare,
	}).map((g) => {
		const m = view(ctx, g.id);
		return { ...g, title: m.title, dueAt: m.dueAt, remainingP80: m.remainingP80 };
	});
	return { spareMin: spare, items };
}
