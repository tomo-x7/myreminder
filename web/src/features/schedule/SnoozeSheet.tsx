import type { PlanTask, WhatIf } from "core/api/types";
import { formatJstDate, formatJstDateTime, fromDatetimeLocal, toDatetimeLocal } from "core/domain/date";
import { errorText } from "core/domain/errors";
import { bottleneckText, formatHours, RISK_LABEL } from "core/domain/schedule";
import { snoozeOptions } from "core/domain/snooze-options";
import { useNow } from "core/hooks/use-now";
import { useWhatIf } from "core/queries/schedule";
import { useUpdateTask } from "core/queries/tasks";
import { useState } from "react";
import { Sheet } from "../../components/Sheet";
import { btnPrimary, btnSecondary, chipClass, ErrorNotice, inputClass, Notice } from "../../components/ui";

export type SnoozeTarget = Pick<PlanTask, "id" | "title" | "dueAt" | "latestStartUsual" | "latestStartHard">;

/** 選んだ時刻に回した場合の事実(再計画の結果)。評価や煽りは入れず、数字だけ出す */
function Facts({ target, data }: { target: SnoozeTarget; data: WhatIf }) {
	const now = useNow();
	const { before, after } = data;
	// label なしの行は、1文のまま横幅いっぱいに出す
	const lines: { label?: string; text: string; tone?: "warn"; block?: boolean }[] = [];
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
		tone: short > 0 ? "warn" : undefined,
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

	return (
		<>
			{notice && <Notice tone="warn">{notice}</Notice>}
			<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5 text-xs">
				{lines.map((l) => {
					const dd = l.tone === "warn" ? "font-semibold text-warn" : "";
					if (l.label === undefined)
						return (
							<dd key={l.text} className={`col-span-2 ${dd}`}>
								{l.text}
							</dd>
						);
					return (
						<div key={l.label} className="contents">
							<dt className={l.block ? "col-span-2 text-sub" : "text-sub"}>{l.label}</dt>
							<dd className={`${l.block ? "col-span-2" : ""} ${dd}`}>{l.text}</dd>
						</div>
					);
				})}
			</dl>
		</>
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
			<div className="flex flex-col gap-2">
				<p className="font-semibold">{target.title}</p>
				{!saved && (
					<div className="flex flex-wrap gap-1.5">
						{options.map((o) => (
							<button
								key={o.label}
								type="button"
								onClick={() => {
									setCustom(false);
									choose(o.at);
								}}
								className={chipClass(startAt === o.at && !custom)}
							>
								{o.label}
							</button>
						))}
						<button type="button" onClick={() => setCustom(true)} className={chipClass(custom)}>
							時刻を指定
						</button>
					</div>
				)}
				{custom && !saved && (
					<div className="flex gap-1.5">
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
					<section className="flex flex-col gap-2 border-t border-line pt-2">
						<p className="text-base font-bold">{formatJstDateTime(startAt)} に回す</p>
						{whatIf.isPending && <p className="text-xs text-faint">再計画しています…</p>}
						{whatIf.isError && <ErrorNotice>再計画できませんでした: {errorText(whatIf.error)}</ErrorNotice>}
						{whatIf.data && <Facts target={target} data={whatIf.data} />}
						{update.isError && <ErrorNotice>保存できませんでした: {errorText(update.error)}</ErrorNotice>}
						{saved ? (
							<>
								<output className="block border-l-2 border-ink py-0.5 pl-2 text-sm font-semibold">
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
