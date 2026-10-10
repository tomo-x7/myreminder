import type { BusyBlock } from "../../lib/queries";
import {
	formatRange,
	formatSpan,
	KIND_LABEL,
	type Period,
	periodOf,
	type RecurringBlock,
	WEEKDAY_LABEL,
	WEEKDAY_ORDER,
} from "./blocks";

type Props = {
	blocks: readonly RecurringBlock[];
	periods: readonly Period[];
	onEdit: (block: BusyBlock) => void;
	onAdd: (weekday: number) => void;
};

/** 曜日ごとの繰り返しの予定(授業・バイト)。曜日の「＋」でその曜日に追加 */
export function WeekList({ blocks, periods, onEdit, onAdd }: Props) {
	return (
		<div className="flex flex-col gap-3">
			{WEEKDAY_ORDER.map((w) => {
				const rows = blocks.filter((b) => b.weekday === w).sort((a, b) => a.startMin - b.startMin);
				return (
					<section key={w} className="rounded-lg border border-gray-300 bg-white">
						<header
							className={`flex items-center justify-between px-3 py-1.5 ${rows.length > 0 ? "border-b border-gray-100" : ""}`}
						>
							<h3 className="flex items-baseline gap-3 text-base font-bold text-gray-900">
								{WEEKDAY_LABEL[w]}曜日
								{rows.length === 0 && (
									<span className="text-sm font-normal text-gray-400">予定なし</span>
								)}
							</h3>
							<button
								type="button"
								aria-label={`${WEEKDAY_LABEL[w]}曜日に追加`}
								onClick={() => onAdd(w)}
								className="rounded-md px-3 py-1 text-xl leading-none font-bold text-blue-700 active:bg-blue-50"
							>
								＋
							</button>
						</header>
						{rows.length > 0 && (
							<ul>
								{rows.map((b) => {
									const period = periodOf(b, periods);
									const span = formatSpan(b);
									return (
										<li key={b.id} className="border-b border-gray-100 last:border-b-0">
											<button
												type="button"
												onClick={() => onEdit(b)}
												className="flex w-full flex-col items-start px-3 py-2 text-left"
											>
												<span className="flex items-baseline gap-2">
													<span className="text-base font-semibold tabular-nums text-gray-900">
														{period ? `${period.period}限 ` : ""}
														{formatRange(b.startMin, b.endMin)}
													</span>
													<span
														className={`rounded px-1.5 py-0.5 text-xs font-bold ${
															b.kind === "class"
																? "bg-blue-100 text-blue-800"
																: "bg-emerald-100 text-emerald-800"
														}`}
													>
														{KIND_LABEL[b.kind]}
													</span>
												</span>
												<span className="text-sm text-gray-800">{b.label || "(名前なし)"}</span>
												{span && <span className="text-xs text-gray-500">{span}</span>}
											</button>
										</li>
									);
								})}
							</ul>
						)}
					</section>
				);
			})}
		</div>
	);
}
