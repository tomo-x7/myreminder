import type { BusyBlock } from "core/api/types";
import type { OneOffBlock } from "core/domain/timetable";
import { listOneOffs } from "core/domain/timetable-view";
import { useState } from "react";
import { btnGhost, listClass, SectionTitle, Tag } from "../../components/ui";
import { type RowSelection, SelectAllButton, SelectableRow } from "./select";

type Props = {
	blocks: readonly OneOffBlock[];
	now: number;
	/** 渡されたら選択中(行は編集でなくチェックボックス) */
	selection?: RowSelection;
	onEdit: (block: BusyBlock) => void;
};

/** 単発の予定。終わったものは既定で隠す。「全選択」は表示中の行だけが対象 */
export function OneOffList({ blocks, now, selection, onEdit }: Props) {
	const [showPast, setShowPast] = useState(false);
	const { rows, pastCount } = listOneOffs(blocks, now, showPast);

	return (
		<section className="flex flex-col">
			<SectionTitle
				action={selection && <SelectAllButton selection={selection} ids={rows.map((r) => r.block.id)} />}
			>
				単発
			</SectionTitle>
			{rows.length === 0 ? (
				<p className="border-b border-line py-2 text-xs text-faint">なし</p>
			) : (
				<ul className={listClass}>
					{rows.map(({ block: b, text, label, kind, past }) => (
						<li key={b.id}>
							<SelectableRow
								id={b.id}
								selection={selection}
								onEdit={() => onEdit(b)}
								className={`flex w-full items-baseline gap-2 py-2 active:bg-wash ${past ? "opacity-60" : ""}`}
							>
								<span className="shrink-0 font-medium whitespace-nowrap">{text}</span>
								<span className="min-w-0 flex-1">{label}</span>
								<Tag>{kind}</Tag>
							</SelectableRow>
						</li>
					))}
				</ul>
			)}
			{pastCount > 0 && (
				<button type="button" onClick={() => setShowPast((v) => !v)} className={`${btnGhost} mt-1 self-start`}>
					{showPast ? "終了分を隠す" : `終了分 ${pastCount}件`}
				</button>
			)}
		</section>
	);
}
