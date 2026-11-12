// 通知時刻の学習。仕様: ai-docs/specs/notification-timing.md
import { startOfJstDay, toJstParts } from "../ai/jst";
import { DAY, HOUR, MINUTE, type Ms } from "../planner/types";

export const TIMING_WARMUP = 28 * DAY;
export const RESPONSE_WINDOW = 30 * MINUTE;
const HALF_LIFE = 28 * DAY;
const ARM_COUNT = 6;

export type TimingNotification = {
	id: string;
	taskId: string | null;
	kind: string;
	status: string;
	sentAt: Ms | null;
	dedupeKey: string | null;
};
export type TimingSession = { id: string; taskId: string; startAt: Ms; kind: string; review: string };
export type TimingArm = { alpha: number; beta: number; count: number; successes: number };
export type TimingModel = { enabled: boolean; arms: readonly TimingArm[]; observations: number };

/** JST 0–4, 4–8, …, 20–24時の6群。睡眠時間は候補生成側で除く。 */
export const timingArm = (at: Ms): number => Math.floor(toJstParts(at).hour / 4);

/**
 * 実送信されたriskだけを学習する。固定時刻のstart/digest/criticalは混ぜない。
 * ひとつの作業開始は、それに先行する直近の適合通知1件にだけ帰属する。
 * firstSentAtは全種別を通じた通知運用の開始時刻(4週間の運用gate)。
 */
export function buildTimingModel(
	notifications: readonly TimingNotification[],
	sessions: readonly TimingSession[],
	now: Ms,
	firstSentAt: Ms | null,
): TimingModel {
	const arms: TimingArm[] = Array.from({ length: ARM_COUNT }, () => ({ alpha: 1, beta: 1, count: 0, successes: 0 }));
	const sent = notifications
		.filter(
			(n): n is TimingNotification & { sentAt: Ms; taskId: string } =>
				n.status === "sent" &&
				n.kind === "risk" &&
				n.taskId !== null &&
				n.dedupeKey?.startsWith(`risk:${n.taskId}:`) === true &&
				n.sentAt !== null &&
				Number.isFinite(n.sentAt) &&
				n.sentAt <= now,
		)
		.sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
	const successful = new Set<string>();
	for (const s of sessions) {
		if (s.kind !== "actual" || s.review !== "confirmed" || !Number.isFinite(s.startAt) || s.startAt > now) continue;
		// 新しい通知から走査。同時刻はid順で固定する。
		for (let i = sent.length - 1; i >= 0; i--) {
			const n = sent[i];
			if (n.sentAt > s.startAt) continue;
			if (n.sentAt < s.startAt - RESPONSE_WINDOW) break;
			if (n.taskId !== s.taskId) continue;
			successful.add(n.id);
			break;
		}
	}
	let observations = 0;
	for (const n of sent) {
		// 成功が先に見えていても、30分の窓が閉じるまでは成功/失敗とも加算しない。
		if (n.sentAt > now - RESPONSE_WINDOW) continue;
		const arm = arms[timingArm(n.sentAt)];
		const age = Math.max(0, startOfJstDay(now) - startOfJstDay(n.sentAt));
		const weight = 2 ** (-age / HALF_LIFE);
		const success = successful.has(n.id);
		arm.alpha += success ? weight : 0;
		arm.beta += success ? 0 : weight;
		arm.count++;
		arm.successes += Number(success);
		observations++;
	}
	return {
		enabled:
			firstSentAt !== null &&
			Number.isFinite(firstSentAt) &&
			now - firstSentAt >= TIMING_WARMUP &&
			observations > 0,
		arms,
		observations,
	};
}

/** 固定seedのPRNG。同じ履歴・候補・seedでは再計画のたびに候補が入れ替わらない。 */
function randomFor(seed: string): () => number {
	let state = 2166136261;
	for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
	return () => {
		state += 0x6d2b79f5;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Marsaglia–Tsang。alpha/beta >= 1なのでshape < 1の分岐は不要。 */
function gamma(shape: number, random: () => number): number {
	const d = shape - 1 / 3;
	const c = 1 / Math.sqrt(9 * d);
	for (;;) {
		const u1 = Math.max(Number.EPSILON, random());
		const x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * random());
		const v0 = 1 + c * x;
		if (v0 <= 0) continue;
		const v = v0 ** 3;
		const u = Math.max(Number.EPSILON, random());
		if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < (x * x) / 2 + d * (1 - v + Math.log(v))) return d * v;
	}
}

/**
 * 安全な候補群だけから選ぶ。時刻の移動/新規作成はしない。
 * 固定通知・本人指定時刻はこの関数へ渡さない。既定どおり時系列を返す。
 */
export function selectRiskBreakpoints(
	candidates: readonly Ms[],
	quota: number,
	model: TimingModel | undefined,
	seed: string,
	minGap = 3 * HOUR,
): Ms[] {
	const sorted = [...new Set(candidates)].filter(Number.isFinite).sort((a, b) => a - b);
	const count = Math.max(0, Math.floor(quota));
	if (count === 0) return [];
	let ranked = sorted;
	if (model?.enabled) {
		const random = randomFor(seed);
		const scores = model.arms.map(({ alpha, beta }) => {
			const a = gamma(alpha, random);
			return a / (a + gamma(beta, random));
		});
		ranked = [...sorted].sort((a, b) => scores[timingArm(b)] - scores[timingArm(a)] || a - b);
	}
	const selected: Ms[] = [];
	for (const at of ranked) {
		if (selected.every((chosen) => Math.abs(chosen - at) >= minGap)) selected.push(at);
		if (selected.length >= count) break;
	}
	return selected.sort((a, b) => a - b);
}
