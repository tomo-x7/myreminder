// ステータス(plan.md §3.7)。有効なステータスの決定と、「作業中」の開始・終了、消し忘れ対策。
// 純粋な部分(resolveEffectiveStatus など)は DB に触れず、service.test.ts 側でテストする
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { busyBlocks, notifications, sessions, tasks, type UserMode, userStatus } from "../db/schema";
import { expandBusyBlocks } from "../planner/busy";
import { DAY, HOUR, JST_OFFSET, MINUTE, type Ms, type SleepWindow } from "../planner/types";
import { getSettings } from "../settings";

// ---------- 純粋関数 ----------

export type ManualStatus = { mode: UserMode; taskId: string | null; until: Ms | null };
export type OpenSessionInfo = { id: string; taskId: string; startAt: Ms };

export type EffectiveStatus = {
	mode: UserMode;
	source: "manual" | "auto";
	taskId?: string;
	taskTitle?: string;
	/** 手動の期限、または自動(授業・睡眠)の終わり。期限なしは省略 */
	until?: Ms;
	/** 自動の「取り込み中」の予定名 */
	label?: string;
	openSession?: OpenSessionInfo;
};

/** now を含む睡眠時間帯の [start, end)(実際の時刻)。時間帯の外なら null。start === end は睡眠なし */
export function sleepWindowAt(sleep: SleepWindow, now: Ms): { start: Ms; end: Ms } | null {
	const { startMin, endMin } = sleep;
	if (startMin === endMin) return null;
	const dayStart = Math.floor((now + JST_OFFSET) / DAY) * DAY - JST_OFFSET;
	const m = (now - dayStart) / MINUTE;
	if (startMin < endMin) {
		return m >= startMin && m < endMin
			? { start: dayStart + startMin * MINUTE, end: dayStart + endMin * MINUTE }
			: null;
	}
	// 日をまたぐ(例: 23:00〜7:00)
	if (m >= startMin) return { start: dayStart + startMin * MINUTE, end: dayStart + DAY + endMin * MINUTE };
	if (m < endMin) return { start: dayStart - DAY + startMin * MINUTE, end: dayStart + endMin * MINUTE };
	return null;
}

/**
 * 有効なステータスを決める。優先順位:
 * 1. 開いている作業記録がある → 作業中(手動。期限なし)
 * 2. 手動の設定が期限内 → それ。`normal` で期限なしは「手動の設定なし」を表す(自動に任せる)
 * 3. 睡眠時間帯 → おやすみ
 * 4. 授業・バイトの最中 → 取り込み中
 * 5. 通常
 */
export function resolveEffectiveStatus(input: {
	now: Ms;
	manual: ManualStatus | null;
	openSession: OpenSessionInfo | null;
	taskTitle?: string;
	sleep: SleepWindow;
	/** now を含む class/job の区間 */
	busy: { label: string; end: Ms }[];
}): EffectiveStatus {
	const { now, manual, openSession, sleep, busy } = input;
	if (openSession) {
		return {
			mode: "working",
			source: "manual",
			taskId: openSession.taskId,
			taskTitle: input.taskTitle,
			openSession,
		};
	}
	if (manual && manual.mode !== "working") {
		const expired = manual.until !== null && manual.until <= now;
		const unset = manual.mode === "normal" && manual.until === null;
		if (!expired && !unset) {
			return { mode: manual.mode, source: "manual", ...(manual.until !== null && { until: manual.until }) };
		}
	}
	const sleeping = sleepWindowAt(sleep, now);
	if (sleeping) return { mode: "sleep", source: "auto", until: sleeping.end };
	const first = busy[0];
	if (first) return { mode: "busy", source: "auto", until: first.end, label: first.label };
	return { mode: "normal", source: "auto" };
}

/** 3時間たったか、残りの見積もりを超えたら確認する。残りが 0 以下のときは見積もりでは判定しない */
export const STILL_WORKING_AFTER_MIN = 180;
export function shouldAskStillWorking(elapsedMin: number, remainingEstimateMin: number): boolean {
	if (elapsedMin >= STILL_WORKING_AFTER_MIN) return true;
	return remainingEstimateMin > 0 && elapsedMin >= remainingEstimateMin;
}

/**
 * 睡眠時間帯に入ったまま作業中だったときの、仮の終了時刻。
 * 「最後に作業していた時刻」の推定 = start + min(経過, 残りの見積もり)。ただし睡眠時間帯の開始は超えない
 * (睡眠中に作業していたことにしない)。start より前にはしない
 */
export function provisionalEnd(input: { startAt: Ms; now: Ms; remainingEstimateMin: number; sleepStart: Ms }): Ms {
	const elapsed = Math.max(0, input.now - input.startAt);
	const guess = input.startAt + Math.min(elapsed, Math.max(0, input.remainingEstimateMin) * MINUTE);
	return Math.max(input.startAt, Math.min(guess, input.sleepStart));
}

/** 残りの見積もり(分)。見積もり × (1 - 直近の進捗)。TODO: プランナーの P80 で置き換える */
export function remainingEstimateMin(estimateMin: number, lastProgress: number | null): number {
	return estimateMin * (1 - (lastProgress ?? 0) / 100);
}

// ---------- DB ----------

/** user_status の行(id=1)。なければ作る */
async function readUserStatus(db: Db): Promise<ManualStatus> {
	await db.insert(userStatus).values({ id: 1 }).onConflictDoNothing();
	const [row] = await db.select().from(userStatus).where(eq(userStatus.id, 1));
	return { mode: row?.mode ?? "normal", taskId: row?.taskId ?? null, until: row?.until ?? null };
}

const setUserStatus = (db: Db, values: { mode: UserMode; taskId: string | null; until: Ms | null }) =>
	db
		.insert(userStatus)
		.values({ id: 1, ...values })
		.onConflictDoUpdate({ target: userStatus.id, set: values });

/** 作業中(未終了)の実績。通常は高々1件 */
export async function findOpenSessions(db: Db) {
	return db
		.select({
			id: sessions.id,
			taskId: sessions.taskId,
			startAt: sessions.startAt,
			taskTitle: tasks.title,
			estimateMin: tasks.estimateMin,
		})
		.from(sessions)
		.innerJoin(tasks, eq(tasks.id, sessions.taskId))
		.where(and(eq(sessions.kind, "actual"), isNull(sessions.endAt)))
		.orderBy(desc(sessions.startAt));
}

export async function getEffectiveStatus(db: Db, now: Ms): Promise<EffectiveStatus> {
	const [manual, [open], settings, blocks] = await Promise.all([
		readUserStatus(db),
		findOpenSessions(db),
		getSettings(db),
		db.select().from(busyBlocks),
	]);
	const busy = expandBusyBlocks(
		blocks.filter((b) => b.kind === "class" || b.kind === "job"),
		now,
		now + 1,
	);
	return resolveEffectiveStatus({
		now,
		manual,
		openSession: open ? { id: open.id, taskId: open.taskId, startAt: open.startAt } : null,
		taskTitle: open?.taskTitle,
		sleep: settings.sleep,
		busy,
	});
}

/** 手動の非作業モード(normal/busy/sleep)を設定する。`normal` + until なしは手動設定の解除 */
export async function setManualStatus(db: Db, mode: Exclude<UserMode, "working">, until: Ms | null) {
	await setUserStatus(db, { mode, taskId: null, until });
}

export type StartWorkingResult = { ok: true; sessionId: string } | { ok: false; error: "task_not_found" };

/** 作業を始める。開いている記録は進捗なしで閉じてから、新しい記録を作る。todo のタスクは doing にする */
export async function startWorking(db: Db, taskId: string, now: Ms): Promise<StartWorkingResult> {
	const [task] = await db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(eq(tasks.id, taskId));
	if (!task) return { ok: false, error: "task_not_found" };
	const sessionId = crypto.randomUUID();
	await db.batch([
		db
			.update(sessions)
			// 開始より前の時刻にならないようにする
			.set({ endAt: sql`max(${sessions.startAt}, ${now})` })
			.where(and(eq(sessions.kind, "actual"), isNull(sessions.endAt))),
		db.insert(sessions).values({ id: sessionId, taskId, kind: "actual", startAt: now, endAt: null }),
		setUserStatus(db, { mode: "working", taskId, until: null }),
		db
			.update(tasks)
			.set({ status: "doing", updatedAt: now })
			.where(and(eq(tasks.id, taskId), eq(tasks.status, "todo"))),
	]);
	return { ok: true, sessionId };
}

export type StopWorkingResult =
	| { ok: true; sessionId: string }
	| { ok: false; error: "not_working" | "invalid_end_at" };

/** 作業を終える。endAt は「○分前に終わった」用(開始以上・現在以下) */
export async function stopWorking(
	db: Db,
	input: { progress: number; endAt?: Ms },
	now: Ms,
): Promise<StopWorkingResult> {
	const [open] = await findOpenSessions(db);
	if (!open) return { ok: false, error: "not_working" };
	const endAt = input.endAt ?? now;
	if (endAt < open.startAt || endAt > now) return { ok: false, error: "invalid_end_at" };
	await db.batch([
		db.update(sessions).set({ endAt, progress: input.progress }).where(eq(sessions.id, open.id)),
		setUserStatus(db, { mode: "normal", taskId: null, until: null }),
	]);
	return { ok: true, sessionId: open.id };
}

/** そのタスクの直近の進捗(確定済みの実績のうち、進捗が入っている最新のもの) */
async function lastProgress(db: Db, taskId: string): Promise<number | null> {
	const [row] = await db
		.select({ progress: sessions.progress })
		.from(sessions)
		.where(
			and(
				eq(sessions.taskId, taskId),
				eq(sessions.kind, "actual"),
				eq(sessions.review, "confirmed"),
				isNotNull(sessions.progress),
			),
		)
		.orderBy(desc(sessions.startAt))
		.limit(1);
	return row?.progress ?? null;
}

/** 「まだやってる?」の通知の打ち先(通知の payload に入れ、1セッション1回の目印にもする) */
export const STATUS_URL = "/status";

/**
 * 作業中の消し忘れ対策(cron から毎分呼ぶ)。
 * (b) 睡眠時間帯に入ってもまだ作業中 → 確認待ち(needs_review)にして、記録の終了を仮置きし、ステータスを通常に戻す。
 *     睡眠時間帯の中で始めた作業は対象外(わざと夜更かしして作業している可能性があるため。(a) だけが効く)
 * (a) 3時間たった、または残りの見積もり(目安)を超えた → 「まだやってる?」を1セッション1回だけ通知する。
 *     通知の種類は schema に合うものがないので `start`(タスクに紐付く作業の通知)を使い、
 *     payload.stillWorkingSessionId を目印にする。(b) を適用した回は (a) を出さない
 */
export async function checkWorkingSessions(
	db: Db,
	now: Ms,
): Promise<{ notified: string[]; markedForReview: string[] }> {
	const open = await findOpenSessions(db);
	const result = { notified: [] as string[], markedForReview: [] as string[] };
	if (open.length === 0) return result;
	const { sleep } = await getSettings(db);
	const sleeping = sleepWindowAt(sleep, now);

	for (const s of open) {
		const remaining = remainingEstimateMin(s.estimateMin, await lastProgress(db, s.taskId));

		if (sleeping && s.startAt < sleeping.start) {
			const endAt = provisionalEnd({
				startAt: s.startAt,
				now,
				remainingEstimateMin: remaining,
				sleepStart: sleeping.start,
			});
			await db.batch([
				db.update(sessions).set({ endAt, review: "needs_review" }).where(eq(sessions.id, s.id)),
				setUserStatus(db, { mode: "normal", taskId: null, until: null }),
			]);
			result.markedForReview.push(s.id);
			continue;
		}

		if (!shouldAskStillWorking((now - s.startAt) / MINUTE, remaining)) continue;
		const [already] = await db
			.select({ id: notifications.id })
			.from(notifications)
			.where(sql`json_extract(${notifications.payload}, '$.stillWorkingSessionId') = ${s.id}`)
			.limit(1);
		if (already) continue;
		const hours = Math.floor((now - s.startAt) / HOUR);
		await db.insert(notifications).values({
			taskId: s.taskId,
			kind: "start",
			priority: 0,
			scheduledAt: now,
			status: "pending",
			payload: {
				title: "まだやってる?",
				body: `「${s.taskTitle}」を${hours >= 1 ? `${hours}時間以上` : "しばらく"}作業中のままです。終わっていたら記録を閉じよう`,
				url: STATUS_URL,
				stillWorkingSessionId: s.id,
			},
		});
		result.notified.push(s.id);
	}
	return result;
}
