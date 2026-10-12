import type { BusyBlock } from "core/api/types";
import { splitBusyBlocks } from "core/domain/timetable-view";
import { useBlockEditor } from "core/forms/busy-block";
import { useNow } from "core/hooks/use-now";
import { useBusyBlocks } from "core/queries/busy-blocks";
import { useSettings } from "core/queries/settings";
import { useTimetableSelection } from "core/screens/timetable";
import { useState } from "react";
import { Sheet } from "../components/Sheet";
import { btnPrimary, btnSecondary, PageHeader, QueryState } from "../components/ui";
import { BlockForm } from "../features/timetable/BlockForm";
import { CourseManager } from "../features/timetable/CourseManager";
import { OneOffList } from "../features/timetable/OneOffList";
import { type RowSelection, SelectBar } from "../features/timetable/select";
import { WeekList } from "../features/timetable/WeekList";

/** 追加(weekday 付き=毎週 / なし)か、編集か */
type Editing = { kind: "new"; weekday?: number } | { kind: "edit"; block: BusyBlock };

function BlockSheet({ editing, onClose }: { editing: Editing; onClose: () => void }) {
	const settings = useSettings();
	const block = editing.kind === "edit" ? editing.block : undefined;
	const editor = useBlockEditor(block, onClose);

	return (
		<Sheet title={block ? "予定編集" : "予定追加"} onClose={onClose}>
			<BlockForm
				block={block}
				defaultWeekday={editing.kind === "new" ? editing.weekday : undefined}
				periods={settings.data?.timetablePeriods ?? []}
				saving={editor.saving}
				error={editor.error}
				onSave={editor.save}
				onDelete={editor.remove}
			/>
		</Sheet>
	);
}

export function TimetablePage() {
	const blocks = useBusyBlocks();
	const settings = useSettings();
	const now = useNow(60_000);
	const [editing, setEditing] = useState<Editing | null>(null);
	const periods = settings.data?.timetablePeriods ?? [];
	// 予定(毎週・単発)と科目をまとめて1回で消すので、選択はここで1つ持つ
	const select = useTimetableSelection();
	const blockSelection: RowSelection | undefined = select.active
		? {
				isSelected: select.isBlockSelected,
				toggle: select.toggleBlock,
				setAll: select.setBlocks,
				allSelected: select.allBlocksSelected,
			}
		: undefined;
	const courseSelection: RowSelection | undefined = select.active
		? {
				isSelected: select.isCourseSelected,
				toggle: select.toggleCourse,
				setAll: select.setCourses,
				allSelected: select.allCoursesSelected,
			}
		: undefined;

	return (
		<div className="flex flex-col gap-3">
			<PageHeader
				title="時間割"
				action={
					!select.active && (
						<div className="flex gap-2">
							<button type="button" onClick={select.start} className={btnSecondary}>
								選択
							</button>
							<button type="button" onClick={() => setEditing({ kind: "new" })} className={btnPrimary}>
								＋ 追加
							</button>
						</div>
					)
				}
			/>
			<QueryState query={blocks}>
				{(list) => {
					const { recurring, oneOff } = splitBusyBlocks(list);
					return (
						<>
							<WeekList
								blocks={recurring}
								periods={periods}
								selection={blockSelection}
								onEdit={(block) => setEditing({ kind: "edit", block })}
								onAdd={(weekday) => setEditing({ kind: "new", weekday })}
							/>
							<OneOffList
								blocks={oneOff}
								now={now}
								selection={blockSelection}
								onEdit={(block) => setEditing({ kind: "edit", block })}
							/>
						</>
					);
				}}
			</QueryState>
			<CourseManager selection={courseSelection} />
			{select.active && (
				<>
					{/* 下の操作バーで本文の最後が隠れないように */}
					<div aria-hidden="true" className="h-24" />
					<SelectBar selection={select} />
				</>
			)}
			{editing && <BlockSheet editing={editing} onClose={() => setEditing(null)} />}
		</div>
	);
}
