import type { BusyBlock } from "core/api/types";
import type { Period, RecurringBlock } from "core/domain/timetable";
import { groupByWeekday } from "core/domain/timetable-view";
import { btnGhost, listClass, SectionTitle, Tag } from "../../components/ui";
import { type RowSelection, SelectAllButton, SelectableRow } from "./select";

type Props = {
	blocks: readonly RecurringBlock[];
	periods: readonly Period[];
	/** 渡されたら選択中(行は編集でなくチェックボックス、「＋」は出さない) */
	selection?: RowSelection;
	onEdit: (block: BusyBlock) => void;
	onAdd: (weekday: number) => void;
};

/** 曜日ごとの繰り返しの予定(授業・バイト)。左に曜日、右に行。曜日の「＋」でその曜日に追加 */
export function WeekList({ blocks, periods, selection, onEdit, onAdd }: Props) {
	// 時限を登録してあるときは、行の頭に時限の枠を取って時刻の位置をそろえる
	const hasPeriods = periods.length > 0;
	return (
		<section className="flex flex-col">
			<SectionTitle action={selection && <SelectAllButton selection={selection} ids={blocks.map((b) => b.id)} />}>
				毎週
			</SectionTitle>
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
												<SelectableRow
													id={b.id}
													selection={selection}
													onEdit={() => onEdit(b)}
													className="flex w-full items-baseline gap-1.5 py-1.5 active:bg-wash"
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
												</SelectableRow>
											</li>
										);
									})}
								</ul>
							)}
							{!selection && (
								<button
									type="button"
									aria-label={`${weekdayLabel}曜日に追加`}
									onClick={() => onAdd(w)}
									className={`${btnGhost} mt-0.5`}
								>
									＋
								</button>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
