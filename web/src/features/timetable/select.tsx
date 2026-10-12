import { selectionSummary, type TimetableSelection } from "core/screens/timetable";
import type { ReactNode } from "react";
import { btnDanger, btnSecondary, ErrorNotice } from "../../components/ui";

/** 区分(予定 / 科目)ごとの選択。渡されたら選択中の表示にする */
export type RowSelection = {
	isSelected: (id: string) => boolean;
	toggle: (id: string) => void;
	setAll: (ids: readonly string[], selected: boolean) => void;
	allSelected: (ids: readonly string[]) => boolean;
};

/** 選択中の行は、頭にチェックボックスを付けた label。そうでなければ編集を開くボタン */
export function SelectableRow({
	id,
	selection,
	onEdit,
	className,
	children,
}: {
	id: string;
	selection: RowSelection | undefined;
	onEdit: () => void;
	className: string;
	children: ReactNode;
}) {
	if (!selection) {
		return (
			<button type="button" onClick={onEdit} className={`${className} text-left`}>
				{children}
				<span aria-hidden="true" className="text-faint">
					›
				</span>
			</button>
		);
	}
	return (
		<label className={`${className} cursor-pointer`}>
			<input
				type="checkbox"
				checked={selection.isSelected(id)}
				onChange={() => selection.toggle(id)}
				className="mt-0.5 size-4 shrink-0 self-start accent-ink"
			/>
			{children}
		</label>
	);
}

/** SectionTitle の右の「全選択」/「全解除」。対象が空なら出さない */
export function SelectAllButton({ selection, ids }: { selection: RowSelection; ids: readonly string[] }) {
	if (ids.length === 0) return null;
	const all = selection.allSelected(ids);
	return (
		<button
			type="button"
			onClick={() => selection.setAll(ids, !all)}
			className="-mb-0.5 rounded-sm px-1 py-0.5 text-xs text-sub active:bg-wash"
		>
			{all ? "全解除" : "全選択"}
		</button>
	);
}

/** 下タブに重ねる操作バー。通常は件数と削除、確認では内訳と戻る/削除 */
export function SelectBar({ selection }: { selection: TimetableSelection }) {
	const { counts, saving } = selection;
	return (
		<div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]">
			<div className="mx-auto flex max-w-xl flex-col gap-2 px-3 py-2">
				{selection.error && <ErrorNotice>{selection.error}</ErrorNotice>}
				{selection.confirming ? (
					<>
						<p>
							{selectionSummary(counts)}を削除{counts.courses > 0 && "(タスクは科目なしになる)"}
						</p>
						<div className="grid grid-cols-2 gap-2">
							<button type="button" className={btnSecondary} disabled={saving} onClick={selection.back}>
								戻る
							</button>
							<button type="button" className={btnDanger} disabled={saving} onClick={selection.remove}>
								{saving ? "削除中…" : "削除"}
							</button>
						</div>
					</>
				) : (
					<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
						<button
							type="button"
							className={`${btnSecondary} justify-self-start`}
							onClick={selection.cancel}
						>
							やめる
						</button>
						<span>{counts.total}件選択</span>
						<button
							type="button"
							className={`${btnDanger} justify-self-end`}
							disabled={counts.total === 0}
							onClick={selection.askConfirm}
						>
							削除
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
