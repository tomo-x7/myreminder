import type { WhatIf } from "core/api/types";
import { formatJstDateTime } from "core/domain/date";
import { type SnoozeTarget, snoozeFacts, useSnooze } from "core/forms/snooze";
import { DatetimeInput } from "../../components/DateTimeInputs";
import { Sheet } from "../../components/Sheet";
import { btnPrimary, btnSecondary, chipClass, ErrorNotice, inputClass, Notice } from "../../components/ui";

export type { SnoozeTarget };

/** 選んだ時刻に回した場合の事実(再計画の結果)。評価や煽りは入れず、数字だけ出す */
function Facts({ target, data }: { target: SnoozeTarget; data: WhatIf }) {
	const { notice, lines } = snoozeFacts(target, data);

	return (
		<>
			{notice && <Notice tone="warn">{notice}</Notice>}
			<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5 text-xs">
				{lines.map((l) => {
					const dd = l.warn ? "font-semibold text-warn" : "";
					if (l.label === undefined)
						return (
							<dd key={l.text} className={`col-span-2 ${dd}`}>
								{l.text}
							</dd>
						);
					return (
						<div key={l.label} className="contents">
							<dt className="text-sub">{l.label}</dt>
							<dd className={dd}>{l.text}</dd>
						</div>
					);
				})}
			</dl>
		</>
	);
}

/** いつに回す?(後回し)。時刻を選ぶ → 再計画の事実を見る → 決める */
export function SnoozeSheet({ target, onClose }: { target: SnoozeTarget; onClose: () => void }) {
	const snooze = useSnooze(target);
	const { startAt, whatIf, saved } = snooze;

	return (
		<Sheet title="いつに回す?" onClose={onClose}>
			<div className="flex flex-col gap-2">
				<p className="font-semibold">{target.title}</p>
				{!saved && (
					<div className="flex flex-wrap gap-1.5">
						{snooze.options.map((o) => (
							<button
								key={o.label}
								type="button"
								onClick={() => snooze.chooseOption(o.at)}
								className={chipClass(snooze.selectedOption === o.at)}
							>
								{o.label}
							</button>
						))}
						<button type="button" onClick={snooze.openCustom} className={chipClass(snooze.custom)}>
							時刻を指定
						</button>
					</div>
				)}
				{snooze.custom && !saved && (
					<div className="flex gap-1.5">
						<DatetimeInput
							aria-label="着手時刻"
							className={inputClass}
							value={snooze.customAt}
							onChange={snooze.setCustomAt}
						/>
						<button
							type="button"
							disabled={!snooze.canChooseCustom}
							onClick={snooze.chooseCustom}
							className={`${btnSecondary} whitespace-nowrap`}
						>
							決める
						</button>
					</div>
				)}

				{startAt !== null && (
					<section className="flex flex-col gap-2 border-t border-line pt-2">
						<p className="text-base font-bold">{formatJstDateTime(startAt)}</p>
						{whatIf.loading && <p className="text-xs text-faint">計算中…</p>}
						{whatIf.error && <ErrorNotice>{whatIf.error}</ErrorNotice>}
						{whatIf.data && <Facts target={target} data={whatIf.data} />}
						{snooze.saveError && <ErrorNotice>{snooze.saveError}</ErrorNotice>}
						{saved ? (
							<>
								<output className="block border-l-2 border-ink py-0.5 pl-2 text-sm font-semibold">
									回した
								</output>
								<button type="button" onClick={onClose} className={btnPrimary}>
									閉じる
								</button>
							</>
						) : (
							<button
								type="button"
								disabled={snooze.saving || whatIf.loading}
								onClick={snooze.save}
								className={btnPrimary}
							>
								回す
							</button>
						)}
					</section>
				)}
			</div>
		</Sheet>
	);
}
