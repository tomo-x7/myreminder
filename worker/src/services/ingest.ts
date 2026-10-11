// 取り込みのスナップショット → 書き込みの一覧(仕様: ai-docs/specs/ingest.md §1)。
// planIngest は純粋関数: 既存の行・スナップショット・紐付け先のタスク・現在時刻だけから、
// 何を書くか(行の作成・更新、タスクの変更、通知)を決める。DB には触れない
import { fmtDue, fmtJst } from "../notify/policy";
import { DAY, HOUR, type Ms } from "../planner/types";
import type { IngestItemInput, IngestResult } from "../schemas/ingest";

/** 初めて見た課題で、締切がこれより前なら自動で無視する */
const PAST_DUE_GRACE = DAY;
/** 締切がこの範囲に入る新しい承認待ちは、個別に通知する */
const NOTIFY_WITHIN = 48 * HOUR;
/** lastSeenAt を書き直す間隔(毎時の同期で全行を書き換えない) */
const SEEN_REFRESH = DAY;

const DONE_STATES = ["TURNED_IN", "RETURNED"];

export type AutoIgnoreReason = "submitted" | "past_due";

/** ingest_items.payload の中身 */
export type ItemPayload = {
	description: string | null;
	kind: string | null;
	autoIgnored?: AutoIgnoreReason;
};

/** 紐付け済みの行に付く、受信箱で確認する変更の提案 */
export type PendingChange = {
	dueAt?: { from: Ms; to: Ms };
	title?: { from: string; to: string };
};

export type ExistingItem = {
	id: string;
	externalId: string;
	title: string;
	courseName: string | null;
	dueAt: Ms | null;
	url: string | null;
	remoteState: string | null;
	payload: unknown;
	status: "pending" | "linked" | "ignored";
	taskId: string | null;
	pendingChange: unknown;
	lastSeenAt: Ms;
};

export type LinkedTask = {
	id: string;
	title: string;
	dueAt: Ms;
	status: "todo" | "doing" | "done" | "submitted" | "dismissed";
};

export type ItemFields = {
	title: string;
	courseName: string | null;
	dueAt: Ms | null;
	url: string | null;
	remoteState: string | null;
	payload: ItemPayload;
};

export type PlannedCreate = ItemFields & {
	externalId: string;
	status: "pending" | "ignored";
	firstSeenAt: Ms;
	lastSeenAt: Ms;
};

export type PlannedUpdate = {
	id: string;
	set: Partial<ItemFields> & { status?: "ignored"; pendingChange?: PendingChange | null; lastSeenAt?: Ms };
};

export type PlannedTaskChange = {
	taskId: string;
	set: { dueAt?: Ms; status?: "todo" | "submitted"; submittedAt?: Ms | null };
	/** 締切を変えた順の履歴(cause は ingest) */
	dueHistory: { oldDueAt: Ms; newDueAt: Ms }[];
};

export type PlannedNotification = {
	kind: "inbox" | "due_change";
	taskId: string | null;
	priority: number;
	payload: { title: string; body: string; url: string };
};

export type IngestPlan = {
	creates: PlannedCreate[];
	updates: PlannedUpdate[];
	taskChanges: PlannedTaskChange[];
	notifications: PlannedNotification[];
	/** 提出済みの報告(webhook)を送るタスク */
	submittedTaskIds: string[];
	result: IngestResult;
};

const asObject = (v: unknown): Record<string, unknown> =>
	v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export const readPayload = (raw: unknown): ItemPayload => {
	const o = asObject(raw);
	return {
		description: typeof o.description === "string" ? o.description : null,
		kind: typeof o.kind === "string" ? o.kind : null,
		...(o.autoIgnored === "submitted" || o.autoIgnored === "past_due" ? { autoIgnored: o.autoIgnored } : {}),
	};
};

export const readPendingChange = (raw: unknown): PendingChange => {
	const o = asObject(raw);
	const out: PendingChange = {};
	const due = asObject(o.dueAt);
	if (typeof due.from === "number" && typeof due.to === "number") out.dueAt = { from: due.from, to: due.to };
	const title = asObject(o.title);
	if (typeof title.from === "string" && typeof title.to === "string") out.title = { from: title.from, to: title.to };
	return out;
};

const isEmptyChange = (c: PendingChange) => !c.dueAt && !c.title;
const sameChange = (a: PendingChange, b: PendingChange) =>
	a.dueAt?.from === b.dueAt?.from &&
	a.dueAt?.to === b.dueAt?.to &&
	a.title?.from === b.title?.from &&
	a.title?.to === b.title?.to;

/** 初めて見たときの自動無視。提出済み・締切切れは受信箱にあふれさせない */
export function autoIgnoreReason(item: Pick<ItemFields, "dueAt" | "remoteState">, now: Ms): AutoIgnoreReason | null {
	if (item.remoteState && DONE_STATES.includes(item.remoteState)) return "submitted";
	if (item.dueAt !== null && item.dueAt < now - PAST_DUE_GRACE) return "past_due";
	return null;
}

export type PlanInput = {
	now: Ms;
	/** その source の既存の行すべて */
	existing: readonly ExistingItem[];
	snapshot: readonly IngestItemInput[];
	/** 紐付け済みの行のタスク(id で引く)。見つからなければ「タスクが消えた」扱い */
	tasks: ReadonlyMap<string, LinkedTask>;
};

export function planIngest({ now, existing, snapshot, tasks }: PlanInput): IngestPlan {
	const byExternalId = new Map(existing.map((e) => [e.externalId, e]));
	// 同じ externalId が2回あれば後のものを使う
	const items = new Map<string, IngestItemInput>();
	for (const it of snapshot) items.set(it.externalId, it);

	const plan: IngestPlan = {
		creates: [],
		updates: [],
		taskChanges: [],
		notifications: [],
		submittedTaskIds: [],
		result: { received: snapshot.length, created: 0, autoIgnored: 0, updated: 0, unchanged: 0 },
	};

	// 同じタスクに複数の行が紐付いても矛盾しないよう、タスクの状態は計画の中で進めながら持つ
	const taskState = new Map<string, LinkedTask>();
	const taskChange = new Map<string, PlannedTaskChange>();
	const changeFor = (taskId: string): PlannedTaskChange => {
		let c = taskChange.get(taskId);
		if (!c) {
			c = { taskId, set: {}, dueHistory: [] };
			taskChange.set(taskId, c);
			plan.taskChanges.push(c);
		}
		return c;
	};

	for (const [externalId, it] of items) {
		const next: ItemFields = {
			title: it.title,
			courseName: it.courseName ?? null,
			dueAt: it.dueAt ?? null,
			url: it.url ?? null,
			remoteState: it.remoteState ?? null,
			payload: { description: it.description ?? null, kind: it.kind ?? null },
		};
		const prev = byExternalId.get(externalId);

		if (!prev) {
			const reason = autoIgnoreReason(next, now);
			if (reason) {
				plan.result.autoIgnored++;
				plan.creates.push({
					...next,
					payload: { ...next.payload, autoIgnored: reason },
					externalId,
					status: "ignored",
					firstSeenAt: now,
					lastSeenAt: now,
				});
				continue;
			}
			plan.result.created++;
			plan.creates.push({ ...next, externalId, status: "pending", firstSeenAt: now, lastSeenAt: now });
			if (next.dueAt !== null && next.dueAt <= now + NOTIFY_WITHIN) {
				plan.notifications.push({
					kind: "inbox",
					taskId: null,
					priority: 1,
					payload: {
						title: `受信箱: ${next.title}`,
						body: `締切 ${fmtDue(next.dueAt, now)}`,
						url: "/inbox",
					},
				});
			}
			continue;
		}

		const prevPayload = readPayload(prev.payload);
		// autoIgnored は初めて見たときの記録なので引き継ぐ
		const nextPayload: ItemPayload = {
			...next.payload,
			...(prevPayload.autoIgnored ? { autoIgnored: prevPayload.autoIgnored } : {}),
		};
		const changed =
			prev.title !== next.title ||
			prev.courseName !== next.courseName ||
			prev.dueAt !== next.dueAt ||
			prev.url !== next.url ||
			prev.remoteState !== next.remoteState ||
			prevPayload.description !== nextPayload.description ||
			prevPayload.kind !== nextPayload.kind;

		const set: PlannedUpdate["set"] = {};
		if (changed) {
			Object.assign(set, next, { payload: nextPayload });
			plan.result.updated++;
		} else {
			plan.result.unchanged++;
		}
		if (changed || now - prev.lastSeenAt >= SEEN_REFRESH) set.lastSeenAt = now;

		// 承認待ちのまま取り込み元で提出された課題は、受信箱に残さない(自動で無視する)
		if (
			prev.status === "pending" &&
			changed &&
			autoIgnoreReason({ dueAt: null, remoteState: next.remoteState }, now)
		) {
			set.status = "ignored";
			set.payload = { ...nextPayload, autoIgnored: "submitted" };
		}

		// 紐付け済み(タスクがあるもの)だけ、取り込み元の変化をタスクに伝える
		const task = prev.status === "linked" && prev.taskId ? tasks.get(prev.taskId) : undefined;
		if (changed && task) {
			const state = taskState.get(task.id) ?? { ...task };
			taskState.set(task.id, state);
			const before = readPendingChange(prev.pendingChange);
			const pending: PendingChange = { ...before };

			if (prev.dueAt !== next.dueAt && next.dueAt !== null) {
				if (next.dueAt < state.dueAt) {
					// 早まった: 見落とすと危ないので、すぐ反映して知らせる
					changeFor(state.id).set.dueAt = next.dueAt;
					changeFor(state.id).dueHistory.push({ oldDueAt: state.dueAt, newDueAt: next.dueAt });
					plan.notifications.push({
						kind: "due_change",
						taskId: state.id,
						priority: 1,
						payload: {
							title: `締切変更: ${state.title}`,
							body: `${fmtJst(state.dueAt)} → ${fmtJst(next.dueAt)}`,
							url: `/tasks/${state.id}`,
						},
					});
					state.dueAt = next.dueAt;
					delete pending.dueAt;
				} else if (next.dueAt > state.dueAt) {
					pending.dueAt = { from: state.dueAt, to: next.dueAt };
				} else {
					delete pending.dueAt;
				}
			}

			if (prev.title !== next.title) {
				if (next.title !== state.title) pending.title = { from: state.title, to: next.title };
				else delete pending.title;
			}

			if (prev.remoteState !== next.remoteState) {
				if (next.remoteState === "TURNED_IN" && state.status !== "submitted") {
					const c = changeFor(state.id);
					c.set.status = "submitted";
					c.set.submittedAt = now;
					state.status = "submitted";
					plan.submittedTaskIds.push(state.id);
				} else if (next.remoteState === "RECLAIMED_BY_STUDENT" && state.status === "submitted") {
					const c = changeFor(state.id);
					c.set.status = "todo";
					c.set.submittedAt = null;
					state.status = "todo";
					plan.notifications.push({
						kind: "inbox",
						taskId: state.id,
						priority: 1,
						payload: {
							title: `提出取消: ${state.title}`,
							body: `未提出に戻した・締切 ${fmtDue(state.dueAt, now)}`,
							url: `/tasks/${state.id}`,
						},
					});
				}
			}

			if (!sameChange(pending, before)) set.pendingChange = isEmptyChange(pending) ? null : pending;
		}

		if (Object.keys(set).length > 0) plan.updates.push({ id: prev.id, set });
	}

	return plan;
}
