// いつに回す?(後回し): 時刻を選ぶ → 再計画の事実を見る → 決める。時刻は epoch ms で持つ
// (datetime-local の文字列との変換は画面の層)
import { useState } from "react";
import type { PlanTask, WhatIf } from "../api/types";
import { formatJstDate, formatJstDateTime, HOUR } from "../domain/date";
import { errorText } from "../domain/errors";
import { bottleneckText, formatHours, RISK_LABEL } from "../domain/schedule";
import { snoozeOptions } from "../domain/snooze-options";
import { useNow } from "../hooks/use-now";
import { useWhatIf } from "../queries/schedule";
import { useUpdateTask } from "../queries/tasks";
import { floorToMinute } from "./common";

export type SnoozeTarget = Pick<PlanTask, "id" | "title" | "dueAt" | "latestStartUsual" | "latestStartHard">;

/** 「選んだ時刻に回した場合」の1行。label がなければ1文のまま横幅いっぱいに出す */
export type SnoozeFactLine = { label?: string; text: string; warn?: boolean; block?: boolean };

/** 選んだ時刻に回した場合の事実(再計画の結果)。評価や煽りは入れず、数字だけ出す */
export function snoozeFacts(
	target: SnoozeTarget,
	data: WhatIf,
	now: number,
): { notice: string | null; lines: SnoozeFactLine[] } {
	const { before, after } = data;
	const lines: SnoozeFactLine[] = [];
	let notice: string | null = null;

	// 着手デッドラインより後なら、先に事実を知らせる
	if (target.latestStartHard !== null && data.startAt > target.latestStartHard) {
		notice = `この時刻は着手デッドライン(${formatJstDateTime(target.latestStartHard)})より後。睡眠を削らずには間に合わなくなる`;
	} else if (target.latestStartUsual !== null && data.startAt > target.latestStartUsual) {
		notice = `この時刻は着手デッドライン(${formatJstDateTime(target.latestStartUsual)})より後。普段のペースでは間に合わなくなり、本気が必要になる`;
	}

	const short = data.neededMin - data.availableUsualMin;
	lines.push({
		label: "その時刻から締切までの空き",
		block: true,
		text: `普段のペースで ${formatHours(data.availableUsualMin)} / 必要 ${formatHours(data.neededMin)}${
			short > 0 ? `(${formatHours(short)} 足りない)` : ""
		}`,
		warn: short > 0,
	});
	lines.push({
		label: "リスク",
		text:
			before.risk === after.risk
				? `${RISK_LABEL[after.risk]}(変わらない)`
				: `${RISK_LABEL[before.risk]} → ${RISK_LABEL[after.risk]}`,
	});
	const ls = (v: number | null) => (v === null ? "置けない" : formatJstDateTime(v));
	lines.push({
		label: "着手デッドライン",
		text:
			before.latestStartUsual === after.latestStartUsual
				? `${ls(after.latestStartUsual)}(変わらない)`
				: `${ls(before.latestStartUsual)} → ${ls(after.latestStartUsual)}`,
	});
	const { before: bb, after: ba } = data.bottleneck;
	if (bb && ba) {
		if (bb.slackUsual === ba.slackUsual) lines.push({ text: `${bottleneckText(ba, now)}(変わらない)` });
		else
			lines.push({
				label: `山場(${formatJstDate(ba.dueAt)})の余裕`,
				text: `${formatHours(bb.slackUsual)} → ${formatHours(ba.slackUsual)}`,
			});
	}
	for (const o of data.changedOthers) {
		lines.push({ label: `「${o.title}」`, text: `${RISK_LABEL[o.before]} → ${RISK_LABEL[o.after]}` });
	}
	return { notice, lines };
}

/** 時刻を選んで(候補か、指定)、再計画の事実を見て、決める */
export function useSnooze(target: SnoozeTarget) {
	const now = useNow();
	const [startAt, setStartAt] = useState<number | null>(null);
	const [custom, setCustom] = useState(false);
	const [customAt, setCustomAt] = useState<number | null>(() => floorToMinute(now + HOUR));
	const [saved, setSaved] = useState(false);
	const update = useUpdateTask();
	const whatIf = useWhatIf(target.id, startAt);

	const choose = (at: number) => {
		setStartAt(at);
		setSaved(false);
		update.reset();
	};

	return {
		now,
		/** 候補(今夜・明日・週末) */
		options: snoozeOptions(now),
		/** 選んでいる時刻。まだ選んでいなければ null */
		startAt,
		/** 候補のどれかを選んでいるときのその時刻。時刻を指定しているときは null */
		selectedOption: custom ? null : startAt,
		chooseOption(at: number) {
			setCustom(false);
			choose(at);
		},
		/** 「時刻を指定」を開いている */
		custom,
		openCustom: () => setCustom(true),
		/** 指定欄の値。打ちかけの間は null */
		customAt,
		setCustomAt,
		/** 指定した時刻を決められる(未来の時刻が入っている) */
		canChooseCustom: customAt !== null && customAt > now,
		chooseCustom() {
			if (customAt !== null) choose(customAt);
		},
		whatIf: {
			loading: whatIf.isPending,
			error: whatIf.isError ? errorText(whatIf.error) : null,
			data: whatIf.data,
		},
		saved,
		saving: update.isPending,
		saveError: update.isError ? errorText(update.error) : null,
		/** 選んだ時刻に回す(着手予定にする) */
		save() {
			if (startAt === null) return;
			update.mutate({ id: target.id, patch: { plannedStartAt: startAt } }, { onSuccess: () => setSaved(true) });
		},
	};
}
