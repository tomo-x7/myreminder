import type { BusyBlock } from "core/api/types";
import type { Period, RecurringBlock } from "core/domain/timetable";
import { groupByWeekday } from "core/domain/timetable-view";
import { btnGhost, listClass, Tag } from "../../components/ui";

type Props = {
	blocks: readonly RecurringBlock[];
	periods: readonly Period[];
	onEdit: (block: BusyBlock) => void;
	onAdd: (weekday: number) => void;
};

/** 曜日ごとの繰り返しの予定(授業・バイト)。左に曜日、右に行。曜日の「＋」でその曜日に追加 */
export function WeekList({ blocks, periods, onEdit, onAdd }: Props) {
	// 時限を登録してあるときは、行の頭に時限の枠を取って時刻の位置をそろえる
	const hasPeriods = periods.length > 0;
	return (
		<ul className={listClass}>
			{groupByWeekday(blocks, periods).map(({ weekday: w, label: weekdayLabel, blocks: rows }) => {
				return (
					<li key={w} className="flex items-start gap-1.5 py-1">
						<h3 className="w-4 shrink-0 py-1.5 text-sm font-semibold">
							{weekdayLabel}
							<span className="sr-only">曜日</span>
						</h3>
						{rows.length === 0 ? (
							<p className="min-w-0 flex-1 py-2 text-xs text-faint">予定なし</p>
						) : (
							<ul className="min-w-0 flex-1">
								{rows.map(({ block: b, period, range, label, span, kind }) => {
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
													<span className="inline-block min-w-[5.5rem]">{range}</span>
												</span>
												<span className="min-w-0 flex-1 text-balance">
													{label}
													{span && <span className="block text-xs text-sub">{span}</span>}
												</span>
												<Tag>{kind}</Tag>
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
							aria-label={`${weekdayLabel}曜日に追加`}
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
