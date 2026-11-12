import type { EstimateReference } from "core/api/types";
import { formatDuration } from "core/domain/time-input";

/** 入力欄の補足ではなく、比較するための実績一覧として表示する */
export function EstimateHistory({ reference }: { reference: EstimateReference }) {
	if (reference.items.length === 0) return null;
	return (
		<details className="border-y border-line py-1">
			<summary className="cursor-pointer text-sm">実績</summary>
			<table className="mt-1 w-full table-fixed text-xs">
				<thead>
					<tr className="border-b border-line text-left">
						<th className="py-1 font-medium">課題</th>
						<th className="w-16 py-1 text-right font-medium">見積もり</th>
						<th className="w-16 py-1 text-right font-medium">実績</th>
					</tr>
				</thead>
				<tbody>
					{reference.items.map((item) => (
						<tr key={item.taskId} className="border-b border-line last:border-0">
							<td className="py-1 pr-2 break-words">{item.title}</td>
							<td className="py-1 text-right">{formatDuration(item.estimateMin)}</td>
							<td className="py-1 text-right">{formatDuration(item.actualMin)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</details>
	);
}
