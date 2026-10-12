// 時間割の「選択して削除」: 予定と科目の選択、確認の段階、まとめて削除
import { useState } from "react";
import { errorText } from "../domain/errors";
import { useDeleteBusyBlocks } from "../queries/busy-blocks";
import { useDeleteCourses } from "../queries/courses";

export type SelectionCounts = { blocks: number; courses: number };

/** `予定 5件・科目 3件`。0件の区分は出さない */
export function selectionSummary({ blocks, courses }: SelectionCounts): string {
	const parts: string[] = [];
	if (blocks > 0) parts.push(`予定 ${blocks}件`);
	if (courses > 0) parts.push(`科目 ${courses}件`);
	return parts.join("・");
}

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
	const next = new Set(set);
	if (!next.delete(id)) next.add(id);
	return next;
}

function withAll(set: ReadonlySet<string>, ids: readonly string[], selected: boolean): Set<string> {
	const next = new Set(set);
	for (const id of ids) {
		if (selected) next.add(id);
		else next.delete(id);
	}
	return next;
}

const hasAll = (set: ReadonlySet<string>, ids: readonly string[]) => ids.length > 0 && ids.every((id) => set.has(id));

export function useTimetableSelection() {
	const deleteBlocks = useDeleteBusyBlocks();
	const deleteCourses = useDeleteCourses();
	const [active, setActive] = useState(false);
	const [blockIds, setBlockIds] = useState<ReadonlySet<string>>(new Set());
	const [courseIds, setCourseIds] = useState<ReadonlySet<string>>(new Set());
	const [confirming, setConfirming] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const cancel = () => {
		setActive(false);
		setBlockIds(new Set());
		setCourseIds(new Set());
		setConfirming(false);
		setError(null);
	};

	const counts = { blocks: blockIds.size, courses: courseIds.size, total: blockIds.size + courseIds.size };

	// 予定→科目の順に1回ずつ。成功した区分はその場で選択から外し、失敗したときの再試行で二重に送らない
	const run = async () => {
		setSaving(true);
		setError(null);
		try {
			if (blockIds.size > 0) {
				await deleteBlocks.mutateAsync([...blockIds]);
				setBlockIds(new Set());
			}
			if (courseIds.size > 0) {
				await deleteCourses.mutateAsync([...courseIds]);
				setCourseIds(new Set());
			}
			cancel();
		} catch (e) {
			setError(errorText(e));
		} finally {
			setSaving(false);
		}
	};

	return {
		active,
		start: () => setActive(true),
		cancel,
		isBlockSelected: (id: string) => blockIds.has(id),
		toggleBlock: (id: string) => setBlockIds((s) => toggled(s, id)),
		isCourseSelected: (id: string) => courseIds.has(id),
		toggleCourse: (id: string) => setCourseIds((s) => toggled(s, id)),
		setBlocks: (ids: readonly string[], selected: boolean) => setBlockIds((s) => withAll(s, ids, selected)),
		setCourses: (ids: readonly string[], selected: boolean) => setCourseIds((s) => withAll(s, ids, selected)),
		/** ids が空なら false */
		allBlocksSelected: (ids: readonly string[]) => hasAll(blockIds, ids),
		allCoursesSelected: (ids: readonly string[]) => hasAll(courseIds, ids),
		counts,
		/** 削除の確認の段階 */
		confirming,
		askConfirm: () => setConfirming(true),
		back: () => {
			setConfirming(false);
			setError(null);
		},
		/** 選ばれた予定と科目を消す。両方消せたら選択を抜ける */
		remove: () => {
			void run();
		},
		saving,
		error,
	};
}

export type TimetableSelection = ReturnType<typeof useTimetableSelection>;
