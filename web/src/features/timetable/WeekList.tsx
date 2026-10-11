import { btnGhost, listClass, Tag } from "../../components/ui";
import type { BusyBlock } from "../../lib/queries";
import { formatMinuteOfDay } from "../../lib/time-input";
import {
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

/** `10:40–12:10`(行の幅を詰めるため、他より細い区切りを使う) */
const range = (startMin: number, endMin: number) => `${formatMinuteOfDay(startMin)}–${formatMinuteOfDay(endMin)}`;

/** 曜日ごとの繰り返しの予定(授業・バイト)。左に曜日、右に行。曜日の「＋」でその曜日に追加 */
export function WeekList({ blocks, periods, onEdit, onAdd }: Props) {
	// 時限を登録してあるときは、行の頭に時限の枠を取って時刻の位置をそろえる
	const hasPeriods = periods.length > 0;
	return (
		<ul className={listClass}>
			{WEEKDAY_ORDER.map((w) => {
				const rows = blocks.filter((b) => b.weekday === w).sort((a, b) => a.startMin - b.startMin);
				return (
					<li key={w} className="flex items-start gap-1.5 py-1">
						<h3 className="w-4 shrink-0 py-1.5 text-sm font-semibold">
							{WEEKDAY_LABEL[w]}
							<span className="sr-only">曜日</span>
						</h3>
						{rows.length === 0 ? (
							<p className="min-w-0 flex-1 py-2 text-xs text-faint">予定なし</p>
						) : (
							<ul className="min-w-0 flex-1">
								{rows.map((b) => {
									const period = periodOf(b, periods);
									const span = formatSpan(b);
									return (
										<li key={b.id}>
											<button
												type="button"
												onClick={() => onEdit(b)}
												className="flex w-full items-baseline gap-1.5 py-1.5 text-left active:bg-wash"
											>
												<span className="shrink-0 font-medium whitespace-nowrap">
													{hasPeriods && (
														<span className="mr-1 inline-block w-6 text-xs font-normal text-sub">
															{period ? `${period.period}限` : ""}
														</span>
													)}
													<span className="inline-block min-w-[5rem]">
														{range(b.startMin, b.endMin)}
													</span>
												</span>
												<span className="min-w-0 flex-1 text-balance">
													{b.label || "(名前なし)"}
													{span && <span className="block text-xs text-sub">{span}</span>}
												</span>
												<Tag>{KIND_LABEL[b.kind]}</Tag>
												<span aria-hidden="true" className="text-faint">
													›
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						)}
						<button
							type="button"
							aria-label={`${WEEKDAY_LABEL[w]}曜日に追加`}
							onClick={() => onAdd(w)}
							className={`${btnGhost} mt-0.5`}
						>
							＋
						</button>
					</li>
				);
			})}
		</ul>
	);
}
