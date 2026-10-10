// 自然文・貼り付けテキスト → 確認カード用の候補(仕様: ai-docs/plan.md §3.2)
import { asc, eq } from "drizzle-orm";
import * as v from "valibot";
import type { Db } from "../db";
import { busyBlocks, courses as coursesTable, settings, type TaskCategory } from "../db/schema";
import type { TaskCreateInput } from "../schemas/task";
import { type BusyBlockRow, DEFAULT_SLEEP, type SleepWindow } from "./busy";
import { type ClientDeps, runJson } from "./client";
import { type CourseRef, labelMatchesCourse, matchCourse } from "./courses";
import { DAY_MS, MINUTE_MS, parseJstDateTime, startOfJstDay, toJstParts, WEEKDAYS_JA } from "./jst";
import { buildMessages, MAX_TEXT_CANDIDATES, type ParseMode } from "./prompts";
import { type CandidatesResponse, candidatesJsonSchema, candidatesResponseSchema, type RawCandidate } from "./schemas";
import { computeStartSuggestions, type StartSuggestion } from "./suggest";

export type ParseContext = {
	courses: CourseRef[];
	busy: BusyBlockRow[];
	sleep: SleepWindow;
};

/** 確認カード1枚分。TaskCreateInput に近い形(dueAt だけ、読み取れないとき null)+ 画面用のメタ情報 */
export type ParsedCandidate = Omit<TaskCreateInput, "dueAt"> & {
	dueAt: number | null;
	/** 一覧にあれば一覧の表記、なければ AI が読んだ科目名 */
	courseName: string | null;
	/** 締切として解釈した原文の語句 */
	dueText: string | null;
	confidence: number;
	needsReview: boolean;
	reviewReasons: string[];
};

export type ParseResult = {
	candidates: ParsedCandidate[];
	startSuggestions: StartSuggestion[];
	/** サーバーの現在時刻(epoch ms)。候補の相対表示の基準にする */
	now: number;
	/** 失敗したとき(candidates は空)。画面では手入力に切り替える */
	error: string | null;
};

export const REVIEW_CONFIDENCE = 0.7;
const MIN_ESTIMATE = 5;
const MAX_ESTIMATE = 600;
const DEFAULT_ESTIMATE: Record<TaskCategory, number> = {
	report: 120,
	exercise: 60,
	quiz: 30,
	presentation: 90,
	other: 60,
};

export function clampEstimate(min: number | null, category: TaskCategory): number {
	if (min === null || !Number.isFinite(min) || min <= 0) return DEFAULT_ESTIMATE[category];
	return Math.min(MAX_ESTIMATE, Math.max(MIN_ESTIMATE, Math.round(min / 5) * 5));
}

const BEFORE_CLASS_RE = /授業(?:の|が)?(?:開始|始まる|始め)?前|授業開始|授業始め|授業まで/;

/**
 * 「授業前」と言っているのに、モデルが授業開始時刻を取り違えたときの補正。
 * 締切の日にその科目の授業があれば、その開始時刻に揃える。授業のない曜日なら確認が必要と知らせる
 */
export function snapToClassStart(
	dueAt: number,
	dueText: string | null,
	courseNames: readonly string[],
	busy: readonly BusyBlockRow[],
): { dueAt: number; reason: string | null } {
	if (!dueText || !BEFORE_CLASS_RE.test(dueText) || courseNames.length === 0) return { dueAt, reason: null };
	const classes = busy.filter(
		(b) =>
			b.kind === "class" && b.weekday != null && b.startMin != null && labelMatchesCourse(b.label, courseNames),
	);
	if (classes.length === 0) return { dueAt, reason: null };
	const weekday = toJstParts(dueAt).weekday;
	const starts = classes.filter((b) => b.weekday === weekday).map((b) => b.startMin as number);
	if (starts.length === 0) {
		return { dueAt, reason: `${WEEKDAYS_JA[weekday]}曜に授業が見つかりません(時間割を確認)` };
	}
	return { dueAt: startOfJstDay(dueAt) + Math.min(...starts) * MINUTE_MS, reason: null };
}

/** モデルの出力 → 確認カード。純粋関数(テスト対象) */
export function normalizeCandidates(
	raw: readonly RawCandidate[],
	ctx: ParseContext,
	now: number,
	mode: ParseMode,
): ParsedCandidate[] {
	const limit = mode === "line" ? 1 : MAX_TEXT_CANDIDATES;
	return raw.slice(0, limit).map((r) => {
		const reasons: string[] = [];
		const confidence = Math.min(1, Math.max(0, r.confidence ?? 0.5));
		const course = matchCourse(r.courseName, ctx.courses);

		let dueAt = r.due === null ? null : parseJstDateTime(r.due);
		if (dueAt === null) {
			reasons.push("締切を読み取れませんでした");
		} else {
			const names = course ? [course.name, ...course.aliases] : r.courseName ? [r.courseName] : [];
			const snapped = snapToClassStart(dueAt, r.dueText, names, ctx.busy);
			dueAt = snapped.dueAt;
			if (snapped.reason) reasons.push(snapped.reason);
			if (dueAt < now) reasons.push("締切が過去になっています");
			else if (dueAt > now + 366 * DAY_MS) reasons.push("締切が1年以上先です");
		}
		if (confidence < REVIEW_CONFIDENCE) reasons.push("自信が低い解釈です");

		return {
			title: r.title.slice(0, 200),
			courseId: course?.id ?? null,
			courseName: course?.name ?? r.courseName,
			category: r.category,
			dueAt,
			dueText: r.dueText,
			estimateMin: clampEstimate(r.estimateMin, r.category),
			estimateSource: "ai",
			firstStep: r.firstStep ? r.firstStep.slice(0, 200) : null,
			plannedStartAt: null,
			confidence,
			needsReview: reasons.length > 0,
			reviewReasons: reasons,
		};
	});
}

const SLEEP_KEY = "sleep";
const sleepSchema = v.object({
	startMin: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1439)),
	endMin: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1440)),
});

/** プロンプトと「いつ始める?」に使う、科目・時間割・睡眠を DB から読む(settings モジュールには依存しない) */
export async function loadParseContext(db: Db): Promise<ParseContext> {
	const [courseRows, busy, sleepRow] = await Promise.all([
		db.select().from(coursesTable).orderBy(asc(coursesTable.name)),
		db.select().from(busyBlocks),
		db.select().from(settings).where(eq(settings.key, SLEEP_KEY)),
	]);
	const sleep = v.safeParse(sleepSchema, sleepRow[0]?.value);
	return {
		courses: courseRows.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases ?? [] })),
		busy,
		sleep: sleep.success ? sleep.output : DEFAULT_SLEEP,
	};
}

const lineResponseSchema = v.pipe(
	candidatesResponseSchema,
	v.check((r) => r.candidates.length >= 1, "no candidates"),
);

export async function parseTasks(
	env: CloudflareBindings,
	input: { text: string; mode: Exclude<ParseMode, "image">; now?: number },
	ctx: ParseContext,
	deps?: ClientDeps,
): Promise<ParseResult> {
	const now = input.now ?? Date.now();
	const startSuggestions = computeStartSuggestions({ now, busy: ctx.busy, sleep: ctx.sleep });
	const messages = buildMessages(input.mode, input.text, { now, courses: ctx.courses, busy: ctx.busy });

	const result = await runJson(
		env,
		{
			purpose: input.mode === "line" ? "parse_line" : "parse_text",
			messages,
			// line は1件必須(空なら再試行)、text は「課題なし」も正しい答え
			schema: input.mode === "line" ? lineResponseSchema : candidatesResponseSchema,
			jsonSchema: candidatesJsonSchema,
			inputText: input.text,
			maxTokens: input.mode === "line" ? 800 : 3000,
		},
		deps,
	);
	if (!result.ok) {
		return { candidates: [], startSuggestions, now, error: failureMessage(result.code) };
	}
	const data: CandidatesResponse = result.data;
	const candidates = normalizeCandidates(data.candidates, ctx, now, input.mode);
	return {
		candidates,
		startSuggestions,
		now,
		error: candidates.length === 0 ? "課題が見つかりませんでした" : null,
	};
}

export function failureMessage(code: "quota" | "invalid_output" | "upstream"): string {
	switch (code) {
		case "quota":
			return "AI の無料枠を使い切りました。手入力してください";
		case "invalid_output":
			return "AI の出力を読み取れませんでした。手入力してください";
		case "upstream":
			return "AI に接続できませんでした。手入力してください";
	}
}
