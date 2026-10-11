import type { BusyBlock } from "core/api/types";
import { formatOneOff, KIND_LABEL, type OneOffBlock } from "core/domain/timetable";
import { useState } from "react";
import { btnGhost, listClass, Tag } from "../../components/ui";

type Props = { blocks: readonly OneOffBlock[]; now: number; onEdit: (block: BusyBlock) => void };

/** 単発の予定。終わったものは既定で隠す */
export function OneOffList({ blocks, now, onEdit }: Props) {
	const [showPast, setShowPast] = useState(false);
	const sorted = [...blocks].sort((a, b) => a.startAt - b.startAt);
	const upcoming = sorted.filter((b) => b.endAt >= now);
	const pastCount = sorted.length - upcoming.length;
	const rows = showPast ? sorted : upcoming;

	return (
		<div className="flex flex-col">
			{rows.length === 0 ? (
				<p className="border-b border-line py-2 text-xs text-faint">単発の予定はありません</p>
			) : (
				<ul className={listClass}>
					{rows.map((b) => (
						<li key={b.id}>
							<button
								type="button"
								onClick={() => onEdit(b)}
								className={`flex w-full items-baseline gap-2 py-2 text-left active:bg-wash ${
									b.endAt < now ? "opacity-60" : ""
								}`}
							>
								<span className="shrink-0 font-medium whitespace-nowrap">{formatOneOff(b)}</span>
								<span className="min-w-0 flex-1">{b.label || "(名前なし)"}</span>
								<Tag>{KIND_LABEL[b.kind]}</Tag>
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
