// 通知ポリシーのエンジン(plan.md §2.2 #3/#6/#7/#9/#10、§3.7、§3.8)。
// 純粋関数だけ。DB・現在時刻には触れない。replan.ts が入力を組み立て、dispatch.ts が送信直前の判断に使う。
//
// - generateNotifications: これから送りたい通知の一覧(dedupeKey 付き)を返す
// - holdDecision / capDecision / isDuplicate / summarizeDeferred: 送信時の判断
import { toJstParts, WEEKDAYS_JA } from "../ai/jst";
import { jstDayStart } from "../planner/busy";
import { DAY, HOUR, type Interval, MINUTE, type Minutes, type Ms, type Risk, type SleepWindow } from "../planner/types";
import { activityDayKey, activityDayOf } from "../services/planning-helpers";
import { sleepWindowAt } from "../services/status";
import { formatDuration, formatHours } from "./format";

// ---------- 型 ----------

export type PolicyKind = "digest" | "start" | "risk" | "critical" | "submit_check" | "evening" | "weekly";
/** DB の notifications.kind 全体(dispatch 側の判断で使う) */
export type AnyKind = PolicyKind | "due_change" | "inbox";

export type PolicyPlanTask = {
	risk: Risk;
	latestStartUsual: Ms | null;
	latestStartHard: Ms | null;
	recommendedStart: Ms | null;
	needsFullEffort: boolean;
	remainingP80: Minutes;
};

export type PolicyTask = {
	id: string;
	title: string;
	dueAt: Ms;
	/** 提出済み・取り下げは渡さない。done は「終わったが未提出」 */
	status: "todo" | "doing" | "done";
	plannedStartAt: Ms | null;
	firstStep: string | null;
	createdAt: Ms;
	/** done になった時刻の近似として使う */
	updatedAt: Ms;
	/** 計画に載っていないタスク(残り0・範囲外)は undefined */
	plan?: PolicyPlanTask;
};

/** 送信済み・保留済みなど、pending 以外の通知(直近の分) */
export type HistoryItem = {
	taskId: string | null;
	kind: AnyKind;
	dedupeKey: string | null;
	/** 送った時刻(なければ予定時刻) */
	at: Ms;
	body: string | null;
};

export type PolicyInput = {
	now: Ms;
	tasks: PolicyTask[];
	overdue: { id: string; title: string; dueAt: Ms }[];
	dropCandidates: { id: string; title: string; dueAt: Ms }[];
	bottleneck: { dueAt: Ms; slackUsual: Minutes } | null;
	/** 授業・バイトの区間(展開済み) */
	busy: Interval[];
	sleep: SleepWindow;
	digest: { morningMin: number; eveningMin: number };
	criticalDuringSleep: boolean;
	history: HistoryItem[];
	/** 最後にダイジェストを送ってから長く空いている(最初の朝に週の見通しを付ける) */
	longGap: boolean;
	/** 受信箱の確認待ち: 承認待ち + 変更の提案。朝のダイジェストに件数だけ載せる */
	inboxPending: number;
	/** これより先の通知は作らない(次の再計画で作る)。既定 48h */
	horizonMs?: Ms;
};

export type DesiredNotification = {
	dedupeKey: string;
	kind: PolicyKind;
	taskId: string | null;
	scheduledAt: Ms;
	priority: number;
	payload: { title: string; body: string; url: string };
};

// ---------- 定数 ----------

export const DAILY_DIGEST_KINDS = ["digest", "weekly", "evening"] as const;
const DEFAULT_HORIZON = 48 * HOUR;
/** 危険の連続通知の最短間隔と、24時間あたりの上限 */
const RISK_MIN_GAP = 3 * HOUR;
const RISK_MAX_PER_DAY = 3;
/** 同じタスクの通知がこれより近いときは、優先度の高い方だけ残す */
const PROXIMITY = 30 * MINUTE;
/** 完了にしてから提出確認までの時間 */
const SUBMIT_CHECK_DELAY = 30 * MINUTE;
const CATCH_UP_WINDOW = 2 * HOUR;

// ---------- 時刻の表示(JST) ----------

const pad2 = (n: number) => String(n).padStart(2, "0");
const jstDayIndex = (t: Ms) => Math.floor(jstDayStart(t) / DAY);

/** "10/14(水) 23:59" */
export function fmtJst(t: Ms): string {
	const p = toJstParts(t);
	return `${p.month}/${p.day}(${WEEKDAYS_JA[p.weekday]}) ${p.hour}:${pad2(p.minute)}`;
}

/** base から見た日の言い方: 今日 / 明日 / N日後 / 昨日 / N日前 */
export function relDay(t: Ms, base: Ms): string {
	const d = jstDayIndex(t) - jstDayIndex(base);
	if (d === 0) return "今日";
	if (d === 1) return "明日";
	if (d === -1) return "昨日";
	return d > 0 ? `${d}日後` : `${-d}日前`;
}

/** "10/14(水) 23:59・3日後"(plan.md §2.2 #2) */
export function fmtDue(t: Ms, base: Ms): string {
	return `${fmtJst(t)}・${relDay(t, base)}`;
}

/** "23:59" */
const fmtTime = (t: Ms): string => {
	const p = toJstParts(t);
	return `${p.hour}:${pad2(p.minute)}`;
};

/** "10/14(水)" */
const fmtDate = (t: Ms): string => {
	const p = toJstParts(t);
	return `${p.month}/${p.day}(${WEEKDAYS_JA[p.weekday]})`;
};

/** "3h" "2h45m" "45m"(締切までの残り) */
export function fmtSpan(ms: Ms): string {
	return formatDuration(ms / MINUTE);
}

/** 必要な時間。見積もりの精度を超えた細かさにならないよう5分単位: "1h35m" "45m" */
const fmtNeed = (min: Minutes): string => formatDuration(Math.max(5, Math.round(min / 5) * 5));

/** t と同じ日なら "21:30"、違えば "明日 9:00" */
const fmtAt = (t: Ms, base: Ms): string => {
	const day = relDay(t, base);
	return day === "今日" ? fmtTime(t) : `${day} ${fmtTime(t)}`;
};

// ---------- 切れ目(breakpoint) ----------

export type Calendar = {
	/** t が睡眠中・授業中なら、その終わりまで進める。空いていれば t のまま */
	snapForward: (t: Ms) => Ms;
	isFree: (t: Ms) => boolean;
	/** [from, to] の切れ目(空き時間の始まり)。授業・バイトの終わり、起床、extra(本人の着手時刻)で、睡眠中・授業中のものは除く */
	breakpoints: (from: Ms, to: Ms, extra?: Ms[]) => Ms[];
};

export function makeCalendar(busy: Interval[], sleep: SleepWindow): Calendar {
	const sorted = [...busy].sort((a, b) => a.start - b.start || a.end - b.end);
	const busyEnd = (t: Ms): Ms | null => {
		let end: Ms | null = null;
		for (const b of sorted) {
			if (b.start > t) break;
			if (t < b.end && (end === null || b.end > end)) end = b.end;
		}
		return end;
	};
	const snapForward = (t: Ms): Ms => {
		let cur = t;
		for (let i = 0; i < 64; i++) {
			const s = sleepWindowAt(sleep, cur);
			if (s) {
				cur = s.end;
				continue;
			}
			const e = busyEnd(cur);
			if (e !== null) {
				cur = e;
				continue;
			}
			break;
		}
		return cur;
	};
	const isFree = (t: Ms) => snapForward(t) === t;
	const breakpoints = (from: Ms, to: Ms, extra: Ms[] = []): Ms[] => {
		const cands: Ms[] = [...sorted.map((b) => b.end), ...extra];
		if (sleep.startMin !== sleep.endMin) {
			for (let day = jstDayStart(from) - DAY; day <= to; day += DAY) cands.push(day + sleep.endMin * MINUTE);
		}
		return [...new Set(cands)].filter((t) => t >= from && t <= to && isFree(t)).sort((a, b) => a - b);
	};
	return { snapForward, isFree, breakpoints };
}

// ---------- 文面 ----------
// 規則は ai-docs/specs/ui.md「通知・ダイジェスト」: タイトルは「<種類の語>: <課題名>」、本文は事実を「・」か改行で並べるだけ

type RiskCtx = {
	/** "締切 10/14(水) 23:59・3日後" */
	due: string;
	/** "着手の限界 21:30"。普段のペースで間に合う着手時刻がなければ null */
	limit: string | null;
	/** "必要 2h" */
	need: string;
};

const joinFacts = (sep: string, parts: (string | null)[]): string => parts.filter((p): p is string => p !== null).join(sep);

const withFirst = (body: string, first: string | null): string => (first ? `${body}\nまず: ${first}` : body);

/**
 * 危険の本文。同じタスクで続けて同じ文面にならないよう、事実は同じで先頭と並べ方だけ変えた型を順番に使う。
 * 事実が2つ(限界なし)でも3型が別の文字列になるよう、最後の型は改行で区切る
 */
type Variant = (c: RiskCtx) => string;

/** 危険(普段のペースで足りる) */
const DANGER_VARIANTS: Variant[] = [
	(c) => joinFacts("・", [c.due, c.need, c.limit]),
	(c) => joinFacts("・", [c.limit, c.need, c.due]),
	(c) => joinFacts("\n", [c.need, c.due, c.limit]),
];

const PACE = "普段のペースでは間に合わない";

/** 危険(普段のペースでは足りない=本気が必要) */
const FULL_EFFORT_VARIANTS: Variant[] = [
	(c) => joinFacts("・", [PACE, c.need, c.due, c.limit]),
	(c) => joinFacts("・", [c.due, c.need, c.limit, PACE]),
	(c) => joinFacts("\n", [PACE, joinFacts("・", [c.need, c.due, c.limit])]),
];

type Candidate = { n: DesiredNotification; rank: number };
/** 近い通知の優先度(小さいほど優先) */
const RANK = { critical: 0, start: 1, submit: 2, safety: 3, danger: 4 } as const;

const taskUrl = (id: string) => `/tasks/${id}`;

// ---------- 本体 ----------

export function generateNotifications(input: PolicyInput): DesiredNotification[] {
	const { now } = input;
	const horizonEnd = now + (input.horizonMs ?? DEFAULT_HORIZON);
	const cal = makeCalendar(input.busy, input.sleep);
	const cands: Candidate[] = [];

	for (const task of input.tasks) cands.push(...taskCandidates(task, input, cal));

	// 本気でも間に合わないとき: 何を諦めるかを活動日(起床から次の起床まで)に1回だけ(正直に。偽の締切は作らない)
	if (input.dropCandidates.length > 0) {
		const at = critTime(input, now, now + DAY);
		const list = input.dropCandidates
			.slice(0, 3)
			.map((d) => `「${d.title}」(${fmtDate(d.dueAt)})`)
			.join("、");
		const more = input.dropCandidates.length > 3 ? ` ほか${input.dropCandidates.length - 3}件` : "";
		cands.push({
			rank: RANK.critical,
			n: {
				// 暦の日付で切ると 0:00 にもう一度鳴るので、送る時刻が属する活動日で切る
				dedupeKey: `drop:${activityDayKey(activityDayOf(at, input.sleep.endMin))}`,
				kind: "critical",
				taskId: null,
				scheduledAt: at,
				priority: 2,
				payload: {
					title: "全部は間に合わない",
					body: `本気でやっても全部は終わらない計算。後回し・相談の候補は ${list}${more}。何を手放すか決めよう。`,
					url: "/tasks",
				},
			},
		});
	}

	// 同じタスクで近すぎる通知は、優先度の高い方だけ残す。直近に送った通知とも近づけない
	const kept: Candidate[] = [];
	for (const c of [...cands].sort((a, b) => a.rank - b.rank || a.n.scheduledAt - b.n.scheduledAt)) {
		const id = c.n.taskId;
		if (id !== null) {
			if (kept.some((k) => k.n.taskId === id && Math.abs(k.n.scheduledAt - c.n.scheduledAt) < PROXIMITY))
				continue;
			if (
				input.history.some(
					(h) =>
						h.taskId === id &&
						h.dedupeKey !== c.n.dedupeKey &&
						h.kind !== "digest" &&
						Math.abs(h.at - c.n.scheduledAt) < PROXIMITY,
				)
			) {
				continue;
			}
		}
		kept.push(c);
	}

	const out: DesiredNotification[] = kept.map((c) => c.n);
	out.push(...digestNotifications(input, cal));

	const seen = new Set<string>();
	return out
		.filter((n) => n.scheduledAt >= now && n.scheduledAt <= horizonEnd)
		.sort((a, b) => a.scheduledAt - b.scheduledAt || (a.dedupeKey < b.dedupeKey ? -1 : 1))
		.filter((n) => {
			if (seen.has(n.dedupeKey)) return false;
			seen.add(n.dedupeKey);
			return true;
		});
}

/** 致命の通知の時刻: 睡眠中は設定次第。送らない設定なら起床後、起床が締切に近すぎるなら睡眠の前に寄せる */
function critTime(input: PolicyInput, t: Ms, dueAt: Ms): Ms {
	const s = sleepWindowAt(input.sleep, t);
	if (!s || input.criticalDuringSleep) return t;
	if (s.end < dueAt - 30 * MINUTE) return s.end;
	return Math.max(input.now, s.start - 10 * MINUTE);
}

function taskCandidates(task: PolicyTask, input: PolicyInput, cal: Calendar): Candidate[] {
	const { now } = input;
	const due = task.dueAt;
	if (due <= now) return []; // 期限切れはダイジェストの件数だけ
	const out: Candidate[] = [];
	const plan = task.plan;
	const isDone = task.status === "done";
	const first = task.firstStep?.trim() || null;
	const url = taskUrl(task.id);

	// 1. 締切ベースの安全網(計画とは独立): 24時間前・3時間前(致命のときは1時間前も)
	const thresholds: { off: Ms; tag: "24h" | "3h" | "1h" }[] = [
		{ off: 24 * HOUR, tag: "24h" },
		{ off: 3 * HOUR, tag: "3h" },
	];
	if (!isDone && plan?.risk === "critical") thresholds.push({ off: HOUR, tag: "1h" });
	let latestPast: (typeof thresholds)[number] | null = null;
	for (const th of thresholds) {
		const t = due - th.off;
		if (t >= now) pushSafety(th, t);
		else latestPast = th;
	}
	// 過ぎてしまった段階は、直近の1つだけ「いま」送る(登録が締切の直前だった場合など)。登録前に過ぎた段階は送らない
	if (latestPast && due - latestPast.off >= task.createdAt) pushSafety(latestPast, now);

	function pushSafety(th: (typeof thresholds)[number], t: Ms) {
		const critical = th.tag !== "24h";
		const at = critical && !isDone ? critTime(input, t, due) : cal.snapForward(t);
		if (at >= due || (th.tag === "24h" && at > due - 3 * HOUR)) return;
		const left = fmtSpan(due - at);
		const dueStr = fmtDue(due, at);
		if (isDone) {
			out.push({
				rank: RANK.submit,
				n: {
					dedupeKey: `due:${task.id}:${due}:${th.tag}`,
					kind: "submit_check",
					taskId: task.id,
					scheduledAt: at,
					priority: th.tag === "24h" ? 0 : 1,
					payload: {
						title: `提出した?: ${task.title}`,
						body: `終わったけど、まだ提出済みになってない。締切 ${dueStr}(あと${left})`,
						url,
					},
				},
			});
			return;
		}
		out.push({
			rank: critical ? RANK.critical : RANK.safety,
			n: {
				dedupeKey: `due:${task.id}:${due}:${th.tag}`,
				kind: critical ? "critical" : "risk",
				taskId: task.id,
				scheduledAt: at,
				priority: critical ? 2 : 0,
				payload: {
					title: critical ? `至急: ${task.title}` : `締切が近い: ${task.title}`,
					body: withFirst(`未提出。締切 ${dueStr}(あと${left})`, first),
					url,
				},
			},
		});
	}

	// 2. 完了にしたのに未提出: 30分後に確認
	if (isDone) {
		const t = task.updatedAt + SUBMIT_CHECK_DELAY;
		if (t >= now - CATCH_UP_WINDOW) {
			const at = cal.snapForward(Math.max(t, now));
			if (at < due) {
				out.push({
					rank: RANK.submit,
					n: {
						dedupeKey: `submit:${task.id}:30m`,
						kind: "submit_check",
						taskId: task.id,
						scheduledAt: at,
						priority: 0,
						payload: {
							title: `提出した?: ${task.title}`,
							body: `終わりにしたけど、提出は済んだ? 出したら「提出済み」にしよう。締切 ${fmtDue(due, at)}`,
							url,
						},
					},
				});
			}
		}
		return out;
	}

	if (!plan) return out;

	// 3. リスク別。本人が決めた着手時刻の合図は余裕でも送る(実装意図)。おすすめ着手時刻は注意だけ
	if (plan.risk === "watch" || plan.risk === "relaxed") {
		const ps = task.plannedStartAt;
		const planned = ps !== null && (plan.latestStartUsual === null || ps <= plan.latestStartUsual);
		let at: Ms | null = null;
		let key = "";
		if (planned && ps !== null) {
			// 本人が決めた着手時刻(過ぎていたら、その時刻には送ったものとして何もしない)
			if (ps >= now) {
				at = cal.snapForward(ps);
				key = `start:${task.id}:${ps}`;
			}
		} else if (plan.risk === "watch" && plan.recommendedStart !== null) {
			at = cal.snapForward(Math.max(plan.recommendedStart, now));
			key = `start:${task.id}:rec`;
		}
		if (at !== null && at < due - 3 * HOUR) {
			out.push({
				rank: RANK.start,
				n: {
					dedupeKey: key,
					kind: "start",
					taskId: task.id,
					scheduledAt: at,
					priority: 0,
					payload: {
						title: `そろそろ始めよう: ${task.title}`,
						body: withFirst(`${planned ? "決めた時刻になった。" : ""}締切 ${fmtDue(due, at)}`, first),
						url,
					},
				},
			});
		}
	}

	if (plan.risk === "danger") out.push(...dangerCandidates(task, plan, input, cal, first));
	return out;
}

/** 危険: 切れ目ごとに、着手デッドラインまで。3時間以上あけて、24時間で最大3件。文面は毎回変える */
function dangerCandidates(
	task: PolicyTask,
	plan: PolicyPlanTask,
	input: PolicyInput,
	cal: Calendar,
	first: string | null,
): Candidate[] {
	const { now } = input;
	const due = task.dueAt;
	const prefix = `risk:${task.id}:`;
	const past = input.history.filter((h) => h.taskId === task.id && h.dedupeKey?.startsWith(prefix));
	const lastAt = past.reduce((m, h) => Math.max(m, h.at), Number.NEGATIVE_INFINITY);
	const sentRecently = past.filter((h) => h.at > now - DAY).length;
	const quota = RISK_MAX_PER_DAY - sentRecently;
	if (quota <= 0) return [];
	const recentBodies = new Set(past.map((h) => h.body));
	// 続き番号は既存の最大+1。履歴の窓から古い分が落ちても、残っているキーとぶつからない
	const nextIndex = past.reduce((m, h) => {
		const n = Number((h.dedupeKey as string).slice(prefix.length));
		return Number.isInteger(n) ? Math.max(m, n + 1) : m;
	}, 0);

	const limit = due - 3 * HOUR; // これ以降は致命の通知が受け持つ
	const windowEnd = Math.min(plan.latestStartUsual ?? plan.latestStartHard ?? limit, limit);
	const earliest = Math.max(now, lastAt + RISK_MIN_GAP);

	const bps = cal.breakpoints(earliest, windowEnd, task.plannedStartAt ? [task.plannedStartAt] : []);
	const times: Ms[] = [];
	let cursor = earliest;
	for (const bp of bps) {
		if (times.length >= quota) break;
		if (bp >= cursor) {
			times.push(bp);
			cursor = bp + RISK_MIN_GAP;
		}
	}
	if (times.length === 0) {
		// 窓の中に切れ目がない(もう過ぎている・すぐ終わる)ときは、次に空いた時刻に1回
		const t = cal.snapForward(earliest);
		if (t < limit) times.push(t);
	}

	const templates = plan.needsFullEffort ? FULL_EFFORT_TEMPLATES : DANGER_TEMPLATES;
	const out: Candidate[] = [];
	const used = new Set<string>();
	times.forEach((at, i) => {
		const ctx: RiskCtx = {
			title: task.title,
			due: fmtDue(due, at),
			startBy:
				plan.latestStartUsual !== null && plan.latestStartUsual >= at
					? `${relDay(plan.latestStartUsual, at)} ${fmtTime(plan.latestStartUsual)}`
					: null,
			need: fmtMinutes(plan.remainingP80),
			first,
		};
		// 使い終えた文面は避ける(直近の文面・この回で使った文面と同じにしない)
		let idx = (nextIndex + i) % templates.length;
		let msg = templates[idx](ctx);
		let body = withFirst(msg.body, first);
		for (let tries = 0; tries < templates.length && (recentBodies.has(body) || used.has(body)); tries++) {
			idx = (idx + 1) % templates.length;
			msg = templates[idx](ctx);
			body = withFirst(msg.body, first);
		}
		used.add(body);
		out.push({
			rank: RANK.danger,
			n: {
				dedupeKey: `${prefix}${nextIndex + i}`,
				kind: "risk",
				taskId: task.id,
				scheduledAt: at,
				priority: 1,
				payload: { title: msg.title, body, url: taskUrl(task.id) },
			},
		});
	});
	return out;
}

// ---------- ダイジェスト ----------

function effectiveStart(t: PolicyTask): Ms | null {
	const p = t.plan;
	if (!p) return null;
	const ps = t.plannedStartAt;
	if (ps !== null && (p.latestStartUsual === null || ps <= p.latestStartUsual)) return ps;
	return p.recommendedStart;
}

const listTitles = (items: { title: string }[], max = 3): string => {
	const head = items
		.slice(0, max)
		.map((t) => `「${t.title}」`)
		.join("、");
	return items.length > max ? `${head} ほか${items.length - max}件` : head;
};

function digestNotifications(input: PolicyInput, cal: Calendar): DesiredNotification[] {
	const { now, tasks, digest } = input;
	const out: DesiredNotification[] = [];
	const open = tasks.filter((t) => t.status !== "done");
	const doneUnsubmitted = tasks.filter((t) => t.status === "done");
	let firstMorning = true;

	for (let d = 0; d < 3; d++) {
		const dayStart = jstDayStart(now) + d * DAY;
		const endOfDay = dayStart + DAY;
		const dateKey = fmtDate(dayStart);

		// 今日やること: 着手時刻(本人の設定かおすすめ)が今日以前のもの
		const todays = open
			.map((t) => ({ t, s: effectiveStart(t) }))
			.filter((x): x is { t: PolicyTask; s: Ms } => x.s !== null && x.s < endOfDay && x.t.dueAt > dayStart)
			.sort((a, b) => a.s - b.s || a.t.dueAt - b.t.dueAt)
			.map((x) => x.t);

		// ---- 朝 ----
		const morningAt = cal.snapForward(dayStart + digest.morningMin * MINUTE);
		if (morningAt < endOfDay && morningAt >= now) {
			const monday = toJstParts(dayStart).weekday === 1;
			const outlook = monday || (firstMorning && input.longGap);
			firstMorning = false;
			const lines: string[] = [];
			if (monday) lines.push("新しい週のはじまり。ここから整えよう。");
			else if (outlook) lines.push("しばらくぶり。今日からやり直そう。");
			if (todays.length > 0) lines.push(`今日やる: ${listTitles(todays)}`);
			const soon = tasks
				.filter((t) => t.dueAt >= dayStart && t.dueAt < dayStart + 2 * DAY)
				.sort((a, b) => a.dueAt - b.dueAt);
			if (soon.length > 0) {
				lines.push(
					`締切: ${soon
						.slice(0, 3)
						.map((t) => `${relDay(t.dueAt, morningAt)} ${fmtTime(t.dueAt)} ${t.title}`)
						.join("、")}${soon.length > 3 ? ` ほか${soon.length - 3}件` : ""}`,
				);
			}
			const b = input.bottleneck;
			if (b && b.dueAt > dayStart && b.dueAt < dayStart + 14 * DAY) {
				const label = b.dueAt < dayStart + 7 * DAY ? "今週の山場" : "次の山場";
				lines.push(
					`${label}: ${fmtDate(b.dueAt)}、${b.slackUsual >= 0 ? "余裕" : "不足"}${fmtHours(b.slackUsual)}`,
				);
			}
			if (outlook) {
				const week = tasks.filter((t) => t.dueAt >= dayStart && t.dueAt < dayStart + 7 * DAY);
				lines.push(week.length > 0 ? `今週の締切 ${week.length}件` : "今週の締切はまだない");
			}
			if (doneUnsubmitted.length > 0) lines.push(`提出はした?: ${listTitles(doneUnsubmitted)}`);
			if (input.overdue.length > 0) lines.push(`期限切れ ${input.overdue.length}件`);
			if (input.inboxPending > 0) lines.push(`受信箱: 確認待ち ${input.inboxPending}件`);
			if (
				lines.length > 0 &&
				(todays.length > 0 ||
					soon.length > 0 ||
					doneUnsubmitted.length > 0 ||
					input.inboxPending > 0 ||
					outlook)
			) {
				out.push({
					dedupeKey: `digest:morning:${dateKey}`,
					kind: monday ? "weekly" : "digest",
					taskId: null,
					scheduledAt: morningAt,
					priority: 0,
					payload: {
						title: monday ? "今週の見通し" : outlook ? "おかえり、今日の見通し" : "今日のダイジェスト",
						body: lines.join("\n"),
						// 月曜の朝は、先週のふりかえり(#26)に飛ばす
						url: monday ? "/review" : "/",
					},
				});
			}
		}

		// ---- 夜 ----
		const eveningAt = cal.snapForward(dayStart + digest.eveningMin * MINUTE);
		if (eveningAt < endOfDay && eveningAt >= now) {
			const dueToday = open.filter((t) => t.dueAt >= dayStart && t.dueAt < endOfDay);
			const plannedToday = [...todays, ...dueToday.filter((t) => !todays.includes(t))];
			if (plannedToday.length > 0 || doneUnsubmitted.length > 0) {
				const lines: string[] = [];
				if (plannedToday.length > 0) {
					lines.push(`今日の予定: ${listTitles(plannedToday)}`);
					lines.push("終わった? 済にするか、いつに回すか決めよう。");
				}
				if (doneUnsubmitted.length > 0) lines.push(`提出はした?: ${listTitles(doneUnsubmitted)}`);
				out.push({
					dedupeKey: `digest:evening:${dateKey}`,
					kind: "evening",
					taskId: null,
					scheduledAt: eveningAt,
					priority: 0,
					payload: { title: "今日の振り返り", body: lines.join("\n"), url: "/" },
				});
			}
		}
	}
	return out;
}

// ---------- 送信時の判断(dispatch.ts から使う) ----------

export type UserModeLike = "normal" | "working" | "busy" | "sleep";

export type RowLike = {
	taskId: string | null;
	kind: AnyKind;
	priority: number;
	payload: {
		title?: string;
		body?: string;
		stillWorkingSessionId?: string;
		dedupeKey?: string;
		cappedCarry?: boolean;
	};
};

export const CRITICAL_PRIORITY = 2;
export const isCriticalRow = (r: Pick<RowLike, "kind" | "priority">): boolean =>
	r.kind === "critical" || r.priority >= CRITICAL_PRIORITY;
export const isDigestKind = (k: AnyKind): boolean => (DAILY_DIGEST_KINDS as readonly string[]).includes(k);
export const isStillWorkingRow = (r: Pick<RowLike, "payload">): boolean => !!r.payload.stillWorkingSessionId;

/**
 * ステータスによる保留。
 * - 「まだやってる?」は常に通す(作業中にこそ必要)
 * - 作業中・取り込み中: 致命以外は保留
 * - おやすみ: 致命も保留。ただし criticalDuringSleep が true なら致命は通す
 */
export function holdDecision(
	row: Pick<RowLike, "kind" | "priority" | "payload">,
	mode: UserModeLike,
	opts: { criticalDuringSleep: boolean },
): "send" | "defer" {
	if (isStillWorkingRow(row)) return "send";
	if (mode === "normal") return "send";
	if (isCriticalRow(row)) return mode === "sleep" && !opts.criticalDuringSleep ? "defer" : "send";
	return "defer";
}

/** 1日の上限に数える通知: 致命・ダイジェスト・まとめ・「まだやってる?」を除く個別通知 */
export function countsTowardDailyLimit(row: RowLike): boolean {
	return !isCriticalRow(row) && !isDigestKind(row.kind) && !isStillWorkingRow(row) && !row.payload.cappedCarry;
}

/** 上限に達していたら、個別通知はまとめ(merge)に回す */
export function capDecision(row: RowLike, sentToday: number, limit: number): "send" | "merge" {
	return countsTowardDailyLimit(row) && sentToday >= limit ? "merge" : "send";
}

/** 同じタスクに同じ文面を1日に2回送らない(同じ dedupeKey の二重挿入も止める) */
export function isDuplicate(row: RowLike, sentToday: RowLike[]): boolean {
	const key = row.payload.dedupeKey;
	return sentToday.some(
		(s) =>
			(key !== undefined && s.payload.dedupeKey === key) ||
			(row.taskId !== null &&
				s.taskId === row.taskId &&
				s.payload.title === row.payload.title &&
				s.payload.body === row.payload.body),
	);
}

/** タスクに結びついた通知を送る意味がなくなったか: 提出済み・取り下げ、または締切を過ぎた(「至急」を締切後に届けない) */
export function taskClosedForNotify(task: { status: string; dueAt: Ms }, now: Ms): boolean {
	return task.status === "submitted" || task.status === "dismissed" || task.dueAt <= now;
}

/** 保留が明けたときの1通にまとめた文面 */
export function summarizeDeferred(items: { title: string }[], max = 5): { title: string; body: string } {
	const lines = items.slice(0, max).map((i) => `・${i.title}`);
	if (items.length > max) lines.push(`ほか${items.length - max}件`);
	return { title: `保留中の通知 ${items.length}件`, body: lines.join("\n") };
}

/** 上限でまとめた通知を、次のダイジェストに足す文面 */
export function appendCapped(body: string, items: { title: string }[]): string {
	if (items.length === 0) return body;
	const { body: list } = summarizeDeferred(items);
	return `${body}${body ? "\n" : ""}まとめた通知 ${items.length}件:\n${list}`;
}
