import { describe, expect, it } from "vitest";
import { HOUR, MINUTE } from "../planner/types";
import {
	capDecision,
	type DesiredNotification,
	generateNotifications,
	holdDecision,
	isDuplicate,
	makeCalendar,
	type PolicyInput,
	type PolicyTask,
	type RowLike,
	summarizeDeferred,
} from "./policy";

const jst = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+09:00`);
const sleep = { startMin: 60, endMin: 480 }; // 1:00-8:00

// 2026-10-12 は月曜
const plan = (over: Partial<NonNullable<PolicyTask["plan"]>> = {}): NonNullable<PolicyTask["plan"]> => ({
	risk: "relaxed",
	latestStartUsual: null,
	latestStartHard: null,
	recommendedStart: null,
	needsFullEffort: false,
	remainingP80: 120,
	...over,
});
const task = (over: Partial<PolicyTask> = {}): PolicyTask => ({
	id: "t1",
	title: "英語レポート",
	dueAt: jst("2026-10-20 23:59"),
	status: "todo",
	plannedStartAt: null,
	firstStep: null,
	createdAt: jst("2026-10-01 00:00"),
	updatedAt: jst("2026-10-01 00:00"),
	plan: plan(),
	...over,
});
const base = (over: Partial<PolicyInput> = {}): PolicyInput => ({
	now: jst("2026-10-13 12:00"),
	tasks: [],
	overdue: [],
	dropCandidates: [],
	bottleneck: null,
	busy: [],
	sleep,
	digest: { morningMin: 8 * 60, eveningMin: 22 * 60 },
	criticalDuringSleep: false,
	history: [],
	longGap: false,
	...over,
});
const gen = (over: Partial<PolicyInput>) => generateNotifications(base(over));
const individual = (list: DesiredNotification[]) => list.filter((n) => n.taskId !== null);
const at = (n: DesiredNotification) => n.scheduledAt;

describe("makeCalendar", () => {
	const busy = [{ start: jst("2026-10-13 13:00"), end: jst("2026-10-13 14:30") }];
	const cal = makeCalendar(busy, sleep);
	it("授業の終わりと起床が切れ目になり、睡眠中・授業中のものは除く", () => {
		const bps = cal.breakpoints(jst("2026-10-13 12:00"), jst("2026-10-14 12:00"));
		expect(bps).toEqual([jst("2026-10-13 14:30"), jst("2026-10-14 08:00")]);
	});
	it("本人の着手時刻も切れ目。授業中のものは除く", () => {
		const bps = cal.breakpoints(jst("2026-10-13 12:00"), jst("2026-10-13 20:00"), [
			jst("2026-10-13 16:00"),
			jst("2026-10-13 13:30"),
		]);
		expect(bps).toEqual([jst("2026-10-13 14:30"), jst("2026-10-13 16:00")]);
	});
	it("snapForward は授業中・睡眠中を抜けるまで進める", () => {
		expect(cal.snapForward(jst("2026-10-13 13:10"))).toBe(jst("2026-10-13 14:30"));
		expect(cal.snapForward(jst("2026-10-14 02:00"))).toBe(jst("2026-10-14 08:00"));
		expect(cal.snapForward(jst("2026-10-13 15:00"))).toBe(jst("2026-10-13 15:00"));
	});
});

describe("リスク別の個別通知", () => {
	it("relaxed は個別通知なし(安全網の締切前通知だけ)", () => {
		const list = gen({ tasks: [task()] });
		expect(individual(list).every((n) => n.dedupeKey.startsWith("due:"))).toBe(true);
	});

	it("watch: 本人の着手時刻に1回。最初の一歩が付く", () => {
		const ps = jst("2026-10-14 20:00");
		const list = gen({
			tasks: [
				task({
					plannedStartAt: ps,
					firstStep: "テンプレを開く",
					plan: plan({
						risk: "watch",
						latestStartUsual: jst("2026-10-18 12:00"),
						recommendedStart: jst("2026-10-16 12:00"),
					}),
				}),
			],
		});
		const start = list.filter((n) => n.kind === "start");
		expect(start).toHaveLength(1);
		expect(at(start[0])).toBe(ps);
		expect(start[0].payload.body).toContain("まず5分: テンプレを開く");
	});

	it("watch: 着手時刻がなければおすすめ着手時刻。授業中なら授業の終わりに寄せる", () => {
		const list = gen({
			tasks: [
				task({
					plan: plan({
						risk: "watch",
						latestStartUsual: jst("2026-10-18 12:00"),
						recommendedStart: jst("2026-10-13 13:20"),
					}),
				}),
			],
			busy: [{ start: jst("2026-10-13 13:00"), end: jst("2026-10-13 14:30") }],
		});
		expect(at(list.find((n) => n.kind === "start") as DesiredNotification)).toBe(jst("2026-10-13 14:30"));
	});

	it("watch: おすすめ着手時刻が睡眠中なら起床後に寄せる", () => {
		const list = gen({
			now: jst("2026-10-13 22:00"),
			tasks: [
				task({
					plan: plan({
						risk: "watch",
						latestStartUsual: jst("2026-10-18 12:00"),
						recommendedStart: jst("2026-10-14 03:00"),
					}),
				}),
			],
		});
		expect(at(list.find((n) => n.kind === "start") as DesiredNotification)).toBe(jst("2026-10-14 08:00"));
	});

	it("watch: 着手時刻がデッドラインより後なら、おすすめ着手時刻を使う", () => {
		const list = gen({
			tasks: [
				task({
					plannedStartAt: jst("2026-10-19 10:00"),
					plan: plan({
						risk: "watch",
						latestStartUsual: jst("2026-10-15 12:00"),
						recommendedStart: jst("2026-10-14 15:00"),
					}),
				}),
			],
		});
		const s = list.find((n) => n.kind === "start") as DesiredNotification;
		expect(at(s)).toBe(jst("2026-10-14 15:00"));
		expect(s.dedupeKey).toBe("start:t1:rec");
	});

	it("danger: 切れ目ごとに最大3件、3時間以上あける。睡眠中には置かない", () => {
		const now = jst("2026-10-13 12:00");
		const list = gen({
			now,
			tasks: [
				task({
					dueAt: jst("2026-10-15 23:59"),
					plan: plan({ risk: "danger", latestStartUsual: jst("2026-10-15 12:00") }),
				}),
			],
			busy: [
				{ start: jst("2026-10-13 12:30"), end: jst("2026-10-13 14:00") },
				{ start: jst("2026-10-13 15:00"), end: jst("2026-10-13 16:00") },
				{ start: jst("2026-10-13 17:30"), end: jst("2026-10-13 19:00") },
			],
		});
		const risk = list.filter((n) => n.kind === "risk" && n.dedupeKey.startsWith("risk:"));
		// 14:00, 19:00(17:00 までは3時間あかない16:00 を飛ばす)、翌朝 8:00 は2件目から3時間以上
		expect(risk.map(at)).toEqual([jst("2026-10-13 14:00"), jst("2026-10-13 19:00"), jst("2026-10-14 08:00")]);
		for (const n of risk) {
			const h = new Date(at(n) + 9 * HOUR).getUTCHours();
			expect(h >= 1 && h < 8).toBe(false);
		}
	});

	it("danger: 本気が必要なら、普段のペースでは間に合わないと言う", () => {
		const list = gen({
			tasks: [
				task({
					dueAt: jst("2026-10-15 23:59"),
					plan: plan({ risk: "danger", needsFullEffort: true, latestStartUsual: jst("2026-10-15 12:00") }),
				}),
			],
		});
		const risk = list.find((n) => n.dedupeKey.startsWith("risk:")) as DesiredNotification;
		expect(risk.payload.body).toContain("普段のペースだと間に合わない。今日から本気モードで");
	});

	it("danger: 同じタスクの連続通知で文面が重ならない。送信済みの文面とも変える", () => {
		const input = base({
			tasks: [
				task({
					dueAt: jst("2026-10-16 23:59"),
					firstStep: "見出しを書く",
					plan: plan({ risk: "danger", latestStartUsual: jst("2026-10-16 12:00") }),
				}),
			],
		});
		const list = generateNotifications(input).filter((n) => n.dedupeKey.startsWith("risk:"));
		expect(list.length).toBeGreaterThanOrEqual(2);
		expect(new Set(list.map((n) => n.payload.body)).size).toBe(list.length);
		expect(new Set(list.map((n) => n.payload.title)).size).toBe(list.length);

		// 1件送信済み(その本文) → 次の件は別の文面、キーは続き番号、間隔は3時間以上あく
		const sent = {
			taskId: "t1",
			kind: "risk" as const,
			dedupeKey: "risk:t1:0",
			at: jst("2026-10-13 11:00"),
			body: list[0].payload.body,
		};
		const next = generateNotifications({ ...input, history: [sent] }).filter((n) =>
			n.dedupeKey.startsWith("risk:"),
		);
		expect(next[0].dedupeKey).toBe("risk:t1:1");
		expect(next.every((n) => n.payload.body !== sent.body)).toBe(true);
		expect(at(next[0])).toBeGreaterThanOrEqual(sent.at + 3 * HOUR);
	});

	it("danger: 24時間に3件送ったあとは作らない", () => {
		const history = [0, 1, 2].map((i) => ({
			taskId: "t1",
			kind: "risk" as const,
			dedupeKey: `risk:t1:${i}`,
			at: jst("2026-10-13 01:00") + i * 3 * HOUR + 7 * HOUR,
			body: `b${i}`,
		}));
		const list = gen({
			tasks: [
				task({
					dueAt: jst("2026-10-16 23:59"),
					plan: plan({ risk: "danger", latestStartUsual: jst("2026-10-16 12:00") }),
				}),
			],
			history,
		});
		expect(list.filter((n) => n.dedupeKey.startsWith("risk:"))).toHaveLength(0);
	});

	it("critical: 締切の3時間前と1時間前に致命の通知(priority 高)", () => {
		const due = jst("2026-10-14 23:59");
		const list = gen({ tasks: [task({ dueAt: due, plan: plan({ risk: "critical" }) })] });
		const crit = list.filter((n) => n.kind === "critical");
		expect(crit.map(at)).toEqual([due - 3 * HOUR, due - HOUR]);
		expect(crit.every((n) => n.priority >= 2)).toBe(true);
	});

	it("critical: 本気でも無理なときは捨てる候補を1通で伝える(偽の締切は作らない)", () => {
		const list = gen({
			tasks: [task({ plan: plan({ risk: "critical" }) })],
			dropCandidates: [{ id: "t1", title: "英語レポート", dueAt: jst("2026-10-20 23:59") }],
		});
		const drop = list.find((n) => n.dedupeKey.startsWith("drop:")) as DesiredNotification;
		expect(drop.kind).toBe("critical");
		expect(drop.payload.body).toContain("英語レポート");
		expect(drop.payload.body).toContain("全部は終わらない");
	});

	it("critical: 睡眠中の時刻は、設定が false なら起床後、true ならそのまま", () => {
		const due = jst("2026-10-14 04:00"); // due-3h = 1:00(睡眠中)
		const t = task({ dueAt: due, plan: plan({ risk: "critical" }) });
		const off = gen({ now: jst("2026-10-13 22:00"), tasks: [t] }).filter((n) => n.dedupeKey.endsWith(":3h"));
		// 起床(8:00)は締切より後 → 睡眠の前に寄せる
		expect(at(off[0])).toBeLessThan(jst("2026-10-14 01:00"));
		const on = gen({ now: jst("2026-10-13 22:00"), tasks: [t], criticalDuringSleep: true }).filter((n) =>
			n.dedupeKey.endsWith(":3h"),
		);
		expect(at(on[0])).toBe(due - 3 * HOUR);
	});
});

describe("安全網(締切ベース)", () => {
	it("未提出のタスクに24時間前と3時間前(計画なしでも)", () => {
		const due = jst("2026-10-14 15:00");
		const list = gen({ tasks: [task({ dueAt: due, plan: undefined })] });
		const keys = list.filter((n) => n.taskId).map((n) => [n.kind, at(n)]);
		expect(keys).toEqual([
			["risk", due - 24 * HOUR],
			["critical", due - 3 * HOUR],
		]);
	});

	it("致命の通知と30分以内に重なる安全網は1つにする", () => {
		// risk=critical の 1h 前と、danger の連続通知(切れ目が1h前の10分後)が近い場合など
		const due = jst("2026-10-14 15:00");
		const list = gen({
			tasks: [task({ dueAt: due, plan: plan({ risk: "critical" }) })],
			busy: [{ start: due - 2 * HOUR, end: due - HOUR + 10 * MINUTE }],
		});
		const near = list.filter((n) => n.taskId && Math.abs(at(n) - (due - HOUR)) < 30 * MINUTE);
		expect(near).toHaveLength(1);
		expect(near[0].kind).toBe("critical");
	});

	it("安全網と近い危険の通知は、安全網(優先度が高い方)だけ残す", () => {
		const due = jst("2026-10-14 15:00");
		const list = gen({
			now: jst("2026-10-13 12:00"),
			tasks: [task({ dueAt: due, plan: plan({ risk: "danger", latestStartUsual: due - 5 * HOUR }) })],
			// 24h 前(10/13 15:00)の10分後が授業の終わり=切れ目
			busy: [{ start: jst("2026-10-13 14:00"), end: jst("2026-10-13 15:10") }],
		});
		const near = list.filter((n) => n.taskId && Math.abs(at(n) - jst("2026-10-13 15:00")) < 30 * MINUTE);
		expect(near.map((n) => n.dedupeKey)).toEqual([`due:t1:${due}:24h`]);
	});

	it("過ぎた段階は直近の1つだけ「いま」送る。登録前に過ぎた段階は送らない", () => {
		const due = jst("2026-10-13 14:00"); // いまから2時間後
		const created = jst("2026-10-10 00:00");
		const list = gen({ tasks: [task({ dueAt: due, createdAt: created, plan: undefined })] });
		const n = list.filter((x) => x.taskId);
		expect(n).toHaveLength(1);
		expect(n[0].dedupeKey).toBe(`due:t1:${due}:3h`);
		expect(at(n[0])).toBe(jst("2026-10-13 12:00"));
		const justCreated = gen({ tasks: [task({ dueAt: due, createdAt: jst("2026-10-13 11:59"), plan: undefined })] });
		expect(justCreated.filter((x) => x.taskId)).toHaveLength(0);
	});
});

describe("提出確認", () => {
	it("完了にして未提出なら、30分後と締切の3時間前", () => {
		const doneAt = jst("2026-10-13 11:50");
		const due = jst("2026-10-14 15:00");
		const list = gen({ tasks: [task({ status: "done", updatedAt: doneAt, dueAt: due, plan: undefined })] });
		const sc = list.filter((n) => n.kind === "submit_check");
		expect(sc.map(at)).toEqual([doneAt + 30 * MINUTE, due - 24 * HOUR, due - 3 * HOUR].sort((a, b) => a - b));
		expect(list.some((n) => n.kind === "critical")).toBe(false);
	});
});

describe("ダイジェスト", () => {
	const t0 = task({
		dueAt: jst("2026-10-14 23:59"),
		plan: plan({
			risk: "watch",
			latestStartUsual: jst("2026-10-14 12:00"),
			recommendedStart: jst("2026-10-13 18:00"),
		}),
	});

	it("朝(月曜は weekly で週の見通し付き)と夜", () => {
		const list = gen({
			now: jst("2026-10-11 20:00"), // 日曜
			tasks: [
				{
					...t0,
					plan: plan({
						risk: "watch",
						latestStartUsual: jst("2026-10-14 12:00"),
						recommendedStart: jst("2026-10-12 18:00"),
					}),
				},
			],
			bottleneck: { dueAt: jst("2026-10-18 23:59"), slackUsual: 90 },
		});
		const mon = list.find((n) => n.dedupeKey === "digest:morning:10/12(月)") as DesiredNotification;
		expect(mon.kind).toBe("weekly");
		expect(at(mon)).toBe(jst("2026-10-12 08:00"));
		expect(mon.payload.body).toContain("今週の山場: 10/18(日)、余裕1.5h");
		expect(mon.payload.body).toContain("今週の締切");
		expect(mon.payload.body).toContain("今日やる: 「英語レポート」");
		const tue = list.find((n) => n.dedupeKey.startsWith("digest:morning:10/13")) as DesiredNotification;
		expect(tue.kind).toBe("digest");
		expect(tue.payload.body).not.toContain("今週の締切");
		const eve = list.find((n) => n.dedupeKey === "digest:evening:10/12(月)") as DesiredNotification;
		expect(eve.kind).toBe("evening");
		expect(eve.payload.body).toContain("終わった?");
	});

	it("長く空いたあとの最初の朝(月曜以外)にも見通しが付く。kind は digest", () => {
		const list = gen({ now: jst("2026-10-13 20:00"), tasks: [t0], longGap: true });
		const m = list.filter((n) => n.dedupeKey.startsWith("digest:morning:"));
		expect(m[0].kind).toBe("digest");
		expect(m[0].payload.body).toContain("今週の締切");
		expect(m[0].payload.title).not.toBe("今日のダイジェスト");
		expect(m[1]?.payload.body ?? "").not.toContain("しばらくぶり");
	});

	it("朝の時刻が睡眠中・授業中なら切れ目に寄せる。期限切れ件数・時刻は JST の相対表示", () => {
		const list = gen({
			now: jst("2026-10-13 20:00"),
			tasks: [t0],
			overdue: [{ id: "x", title: "古い", dueAt: jst("2026-10-01 00:00") }],
			digest: { morningMin: 7 * 60, eveningMin: 22 * 60 },
		});
		const m = list.find((n) => n.dedupeKey.startsWith("digest:morning:")) as DesiredNotification;
		expect(at(m)).toBe(jst("2026-10-14 08:00"));
		expect(m.payload.body).toContain("期限切れ 1件");
		expect(m.payload.body).toContain("今日 23:59 英語レポート");
	});

	it("何もなければダイジェストを作らない", () => {
		expect(gen({ tasks: [] })).toEqual([]);
	});
});

describe("送信時の判断", () => {
	const row = (over: Partial<RowLike> = {}): RowLike => ({
		taskId: "t1",
		kind: "risk",
		priority: 0,
		payload: { title: "a", body: "b" },
		...over,
	});
	const crit = row({ kind: "critical", priority: 2 });
	const still = row({ kind: "start", payload: { stillWorkingSessionId: "s1" } });
	const opts = { criticalDuringSleep: false };

	it("通常は送る", () => expect(holdDecision(row(), "normal", opts)).toBe("send"));
	it("作業中・取り込み中は致命以外を保留。致命と「まだやってる?」は通す", () => {
		for (const m of ["working", "busy"] as const) {
			expect(holdDecision(row(), m, opts)).toBe("defer");
			expect(holdDecision(row({ kind: "digest" }), m, opts)).toBe("defer");
			expect(holdDecision(crit, m, opts)).toBe("send");
			expect(holdDecision(still, m, opts)).toBe("send");
		}
	});
	it("おやすみは致命も保留。criticalDuringSleep なら致命だけ通す", () => {
		expect(holdDecision(crit, "sleep", opts)).toBe("defer");
		expect(holdDecision(crit, "sleep", { criticalDuringSleep: true })).toBe("send");
		expect(holdDecision(row(), "sleep", { criticalDuringSleep: true })).toBe("defer");
		expect(holdDecision(still, "sleep", opts)).toBe("send");
	});

	it("1日の上限: 個別通知だけ数え、超えたらまとめる。致命・ダイジェスト・まだやってる? は対象外", () => {
		expect(capDecision(row(), 2, 3)).toBe("send");
		expect(capDecision(row(), 3, 3)).toBe("merge");
		expect(capDecision(row({ kind: "start" }), 5, 3)).toBe("merge");
		expect(capDecision(crit, 9, 3)).toBe("send");
		expect(capDecision(row({ kind: "digest" }), 9, 3)).toBe("send");
		expect(capDecision(row({ kind: "evening" }), 9, 3)).toBe("send");
		expect(capDecision(still, 9, 3)).toBe("send");
		expect(capDecision(row(), 0, 0)).toBe("merge");
	});

	it("同じタスクに同じ文面は1日に2回送らない", () => {
		expect(isDuplicate(row(), [row()])).toBe(true);
		expect(isDuplicate(row(), [row({ payload: { title: "a", body: "別" } })])).toBe(false);
		expect(isDuplicate(row(), [row({ taskId: "t2" })])).toBe(false);
		expect(
			isDuplicate(row({ payload: { dedupeKey: "k" } }), [row({ payload: { dedupeKey: "k", title: "x" } })]),
		).toBe(true);
	});

	it("保留のまとめ文面", () => {
		const s = summarizeDeferred([{ title: "A" }, { title: "B" }]);
		expect(s.title).toBe("保留中の通知 2件");
		expect(s.body).toBe("・A\n・B");
		expect(summarizeDeferred(Array.from({ length: 7 }, (_, i) => ({ title: `T${i}` }))).body).toContain("ほか2件");
	});
});
