import type { BusyBlock } from "core/api/types";
import type { OneOffBlock } from "core/domain/timetable";
import { listOneOffs } from "core/domain/timetable-view";
import { useState } from "react";
import { btnGhost, listClass, Tag } from "../../components/ui";

type Props = { blocks: readonly OneOffBlock[]; now: number; onEdit: (block: BusyBlock) => void };

/** 単発の予定。終わったものは既定で隠す */
export function OneOffList({ blocks, now, onEdit }: Props) {
	const [showPast, setShowPast] = useState(false);
	const { rows, pastCount } = listOneOffs(blocks, now, showPast);

	return (
		<div className="flex flex-col">
			{rows.length === 0 ? (
				<p className="border-b border-line py-2 text-xs text-faint">単発の予定はありません</p>
			) : (
				<ul className={listClass}>
					{rows.map(({ block: b, text, label, kind, past }) => (
						<li key={b.id}>
							<button
								type="button"
								onClick={() => onEdit(b)}
								className={`flex w-full items-baseline gap-2 py-2 text-left active:bg-wash ${
									past ? "opacity-60" : ""
								}`}
							>
								<span className="shrink-0 font-medium whitespace-nowrap">{text}</span>
								<span className="min-w-0 flex-1">{label}</span>
								<Tag>{kind}</Tag>
								<span aria-hidden="true" className="text-faint">
									›
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
			{pastCount > 0 && (
				<button type="button" onClick={() => setShowPast((v) => !v)} className={`${btnGhost} mt-1 self-start`}>
					{showPast ? "終わった予定を隠す" : `終わった予定を見る(${pastCount}件)`}
				</button>
			)}
		</div>
	);
}
