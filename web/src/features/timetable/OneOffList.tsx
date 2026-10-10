import { useState } from "react";
import type { BusyBlock } from "../../lib/queries";
import { formatOneOff, KIND_LABEL, type OneOffBlock } from "./blocks";

type Props = { blocks: readonly OneOffBlock[]; now: number; onEdit: (block: BusyBlock) => void };

/** 単発の予定。終わったものは既定で隠す */
export function OneOffList({ blocks, now, onEdit }: Props) {
	const [showPast, setShowPast] = useState(false);
	const sorted = [...blocks].sort((a, b) => a.startAt - b.startAt);
	const upcoming = sorted.filter((b) => b.endAt >= now);
	const pastCount = sorted.length - upcoming.length;
	const rows = showPast ? sorted : upcoming;

	return (
		<div className="flex flex-col gap-2">
			{rows.length === 0 ? (
				<p className="text-sm text-gray-500">単発の予定はありません</p>
			) : (
				<ul className="flex flex-col gap-2">
					{rows.map((b) => (
						<li key={b.id}>
							<button
								type="button"
								onClick={() => onEdit(b)}
								className={`flex w-full flex-col items-start rounded-lg border border-gray-300 bg-white px-3 py-2 text-left ${
									b.endAt < now ? "opacity-60" : ""
								}`}
							>
								<span className="text-base font-semibold tabular-nums text-gray-900">
									{formatOneOff(b)}
								</span>
								<span className="text-sm text-gray-800">
									{b.label || "(名前なし)"} ・ {KIND_LABEL[b.kind]}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
			{pastCount > 0 && (
				<button
					type="button"
					onClick={() => setShowPast((v) => !v)}
					className="self-start px-1 py-1 text-sm font-medium text-blue-700"
				>
					{showPast ? "終わった予定を隠す" : `終わった予定を見る(${pastCount}件)`}
				</button>
			)}
		</div>
	);
}
