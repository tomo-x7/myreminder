import { useState } from "react";
import { Link } from "wouter";
import { Sheet } from "../components/Sheet";
import { btnPrimary, linkClass, Notice, PageHeader, QueryState, SectionTitle } from "../components/ui";
import { BlockForm } from "../features/timetable/BlockForm";
import { isOneOff, isRecurring } from "../features/timetable/blocks";
import { CourseManager } from "../features/timetable/CourseManager";
import { OneOffList } from "../features/timetable/OneOffList";
import { WeekList } from "../features/timetable/WeekList";
import {
	type BusyBlock,
	useBusyBlocks,
	useCourses,
	useCreateBusyBlock,
	useDeleteBusyBlock,
	useSettings,
	useUpdateBusyBlock,
} from "../lib/queries";
import { useNow } from "../lib/use-now";

/** 追加(weekday 付き=毎週 / なし)か、編集か */
type Editing = { kind: "new"; weekday?: number } | { kind: "edit"; block: BusyBlock };

function BlockSheet({ editing, onClose }: { editing: Editing; onClose: () => void }) {
	const settings = useSettings();
	const courses = useCourses();
	const create = useCreateBusyBlock();
	const update = useUpdateBusyBlock();
	const remove = useDeleteBusyBlock();
	const block = editing.kind === "edit" ? editing.block : undefined;
	const busy = create.isPending || update.isPending || remove.isPending;
	const error = create.error ?? update.error ?? remove.error;

	return (
		<Sheet title={block ? "予定を編集" : "予定を追加"} onClose={onClose}>
			<BlockForm
				block={block}
				defaultWeekday={editing.kind === "new" ? editing.weekday : undefined}
				periods={settings.data?.timetablePeriods ?? []}
				courses={courses.data ?? []}
				saving={busy}
				error={error?.message ?? null}
				onSave={(input) =>
					block
						? update.mutate({ id: block.id, patch: input }, { onSuccess: onClose })
						: create.mutate(input, { onSuccess: onClose })
				}
				onDelete={block ? () => remove.mutate(block.id, { onSuccess: onClose }) : undefined}
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

	return (
		<div className="flex flex-col gap-3">
			<PageHeader
				title="時間割"
				action={
					<button type="button" onClick={() => setEditing({ kind: "new" })} className={btnPrimary}>
						＋ 追加
					</button>
				}
			/>
			{periods.length === 0 && (
				<Notice>
					<Link href="/settings" className={linkClass}>
						設定
					</Link>
					で時限の時刻を登録すると、授業を「N限」で選べます
				</Notice>
			)}
			<QueryState query={blocks}>
				{(list) => (
					<>
						<section className="flex flex-col">
							<SectionTitle>毎週の予定</SectionTitle>
							<WeekList
								blocks={list.filter(isRecurring)}
								periods={periods}
								onEdit={(block) => setEditing({ kind: "edit", block })}
								onAdd={(weekday) => setEditing({ kind: "new", weekday })}
							/>
						</section>
						<section className="flex flex-col">
							<SectionTitle>単発の予定</SectionTitle>
							<OneOffList
								blocks={list.filter(isOneOff)}
								now={now}
								onEdit={(block) => setEditing({ kind: "edit", block })}
							/>
						</section>
					</>
				)}
			</QueryState>
			<CourseManager />
			{editing && <BlockSheet editing={editing} onClose={() => setEditing(null)} />}
		</div>
	);
}
