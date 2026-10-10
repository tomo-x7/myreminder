import { useState } from "react";
import { Sheet } from "../../components/Sheet";
import { btnPrimary, btnSecondary, ErrorNotice, inputClass } from "../../components/ui";
import { formatJstDate, formatJstDateTime, fromDatetimeLocal, toDatetimeLocal } from "../../lib/date";
import { useUpdateTask } from "../../lib/queries";
import { useNow } from "../../lib/use-now";
import { bottleneckText, formatHours, RISK_LABEL } from "./format";
import { type PlanTask, useWhatIf, type WhatIf } from "./hooks";
import { snoozeOptions } from "./snooze-options";

export type SnoozeTarget = Pick<PlanTask, "id" | "title" | "dueAt" | "latestStartUsual" | "latestStartHard">;

const chip = "rounded-full border border-gray-300 bg-white px-4 py-2.5 text-base font-medium active:bg-gray-100";

/** 選んだ時刻に回した場合の事実(再計画の結果)。評価や煽りは入れず、数字だけ出す */
function Facts({ target, data }: { target: SnoozeTarget; data: WhatIf }) {
	const now = useNow();
	const { before, after } = data;
	const lines: { text: string; tone?: "warn" }[] = [];

	// 着手デッドラインより後なら、先に事実を知らせる
	if (target.latestStartHard !== null && data.startAt > target.latestStartHard) {
		lines.push({
			text: `この時刻は着手デッドライン(${formatJstDateTime(target.latestStartHard)})より後。睡眠を削らずには間に合わなくなる`,
			tone: "warn",
		});
	} else if (target.latestStartUsual !== null && data.startAt > target.latestStartUsual) {
		lines.push({
			text: `この時刻は着手デッドライン(${formatJstDateTime(target.latestStartUsual)})より後。普段のペースでは間に合わなくなり、本気が必要になる`,
			tone: "warn",
		});
	}

	const short = data.neededMin - data.availableUsualMin;
	lines.push({
		text: `その時刻から締切までの空き: 普段のペースで ${formatHours(data.availableUsualMin)} / 必要 ${formatHours(data.neededMin)}${
			short > 0 ? `(${formatHours(short)} 足りない)` : ""
		}`,
		tone: short > 0 ? "warn" : undefined,
	});
	lines.push({
		text:
			before.risk === after.risk
				? `リスク: ${RISK_LABEL[after.risk]}(変わらない)`
				: `リスク: ${RISK_LABEL[before.risk]} → ${RISK_LABEL[after.risk]}`,
	});
	const ls = (v: number | null) => (v === null ? "置けない" : formatJstDateTime(v));
	lines.push({
		text:
			before.latestStartUsual === after.latestStartUsual
				? `着手デッドライン: ${ls(after.latestStartUsual)}(変わらない)`
				: `着手デッドライン: ${ls(before.latestStartUsual)} → ${ls(after.latestStartUsual)}`,
	});
	const { before: bb, after: ba } = data.bottleneck;
	if (bb && ba) {
		lines.push({
			text:
				bb.slackUsual === ba.slackUsual
					? `${bottleneckText(ba, now)}(変わらない)`
					: `山場(${formatJstDate(ba.dueAt)})の余裕: ${formatHours(bb.slackUsual)} → ${formatHours(ba.slackUsual)}`,
		});
	}
	for (const o of data.changedOthers) {
		lines.push({ text: `「${o.title}」: ${RISK_LABEL[o.before]} → ${RISK_LABEL[o.after]}` });
	}

	return (
		<ul className="flex flex-col gap-1.5 rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
			{lines.map((l) => (
				<li key={l.text} className={l.tone === "warn" ? "font-semibold text-orange-800" : undefined}>
					{l.text}
				</li>
			))}
		</ul>
	);
}

/** いつに回す?(後回し)。時刻を選ぶ → 再計画の事実を見る → 決める */
export function SnoozeSheet({ target, onClose }: { target: SnoozeTarget; onClose: () => void }) {
	const now = useNow();
	const options = snoozeOptions(now);
	const [startAt, setStartAt] = useState<number | null>(null);
	const [custom, setCustom] = useState(false);
	const [customValue, setCustomValue] = useState(() => toDatetimeLocal(now + 3_600_000));
	const [saved, setSaved] = useState(false);
	const update = useUpdateTask();
	const whatIf = useWhatIf(target.id, startAt);

	const choose = (at: number) => {
		setStartAt(at);
		setSaved(false);
		update.reset();
	};
	const customAt = fromDatetimeLocal(customValue);

	return (
		<Sheet title="いつに回す?" onClose={onClose}>
			<div className="flex flex-col gap-4">
				<p className="text-base font-semibold text-gray-900">{target.title}</p>
				{!saved && (
					<div className="flex flex-wrap gap-2">
						{options.map((o) => (
							<button
								key={o.label}
								type="button"
								onClick={() => {
									setCustom(false);
									choose(o.at);
								}}
								className={`${chip} ${startAt === o.at && !custom ? "border-blue-600 bg-blue-50" : ""}`}
							>
								{o.label}
							</button>
						))}
						<button
							type="button"
							onClick={() => setCustom(true)}
							className={`${chip} ${custom ? "border-blue-600 bg-blue-50" : ""}`}
						>
							時刻を指定
						</button>
					</div>
				)}
				{custom && !saved && (
					<div className="flex gap-2">
						<input
							type="datetime-local"
							aria-label="着手する時刻"
							className={inputClass}
							value={customValue}
							onChange={(e) => setCustomValue(e.target.value)}
						/>
						<button
							type="button"
							disabled={customAt === null || customAt <= now}
							onClick={() => customAt !== null && choose(customAt)}
							className={`${btnSecondary} whitespace-nowrap`}
						>
							決める
						</button>
					</div>
				)}

				{startAt !== null && (
					<section className="flex flex-col gap-3">
						<p className="text-lg font-bold text-gray-900">{formatJstDateTime(startAt)} に回す</p>
						{whatIf.isPending && <p className="text-sm text-gray-500">再計画しています…</p>}
						{whatIf.isError && <ErrorNotice>再計画できませんでした: {whatIf.error.message}</ErrorNotice>}
						{whatIf.data && <Facts target={target} data={whatIf.data} />}
						{update.isError && <ErrorNotice>保存できませんでした: {update.error.message}</ErrorNotice>}
						{saved ? (
							<>
								<output className="block rounded-md bg-green-100 px-3 py-2 text-sm text-green-800">
									{formatJstDateTime(startAt)} に回しました
								</output>
								<button type="button" onClick={onClose} className={btnPrimary}>
									閉じる
								</button>
							</>
						) : (
							<button
								type="button"
								disabled={update.isPending || whatIf.isPending}
								onClick={() =>
									update.mutate(
										{ id: target.id, patch: { plannedStartAt: startAt } },
										{ onSuccess: () => setSaved(true) },
									)
								}
								className={btnPrimary}
							>
								この時刻に回す
							</button>
						)}
					</section>
				)}
			</div>
		</Sheet>
	);
}
