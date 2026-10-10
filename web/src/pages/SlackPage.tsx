import { useState } from "react";
import { Link } from "wouter";
import { DueLabel } from "../components/DueLabel";
import { btnPrimary, ErrorNotice, PageHeader, QueryState } from "../components/ui";
import { formatShort } from "../features/schedule/format";
import { type SlackItem, useSlackList } from "../features/schedule/hooks";
import { errorText, useStartWorking, useStatus } from "../features/status";
import { useNow } from "../lib/use-now";

const SPARE_CHOICES = [30, 60, 90] as const;

const REASON_TEXT: Record<SlackItem["reason"], string> = {
	big_block: "まとまった時間が要るので、大きく空いている今やる価値が高い",
	uncertain: "見積もりが読めないので、早めに手を付けると読みが当たる",
	before_peak: "山場の手前",
	earliest: "締切が早い",
};

/** 「この60分で: 山場の余裕 +1h」。山場の余裕が変わらないときは、全体の余裕の改善だけ伝える */
function gainText(item: SlackItem, spareMin: number): string {
	const head = `この${spareMin}分で: `;
	if (item.bottleneckDeltaMin > 0) return `${head}山場の余裕 +${formatShort(item.bottleneckDeltaMin)}`;
	if (item.stressDelta < 0) return `${head}全体の余裕が少し増える`;
	return `${head}計画への影響はほとんどない`;
}

function SlackRow({ item, spareMin, now }: { item: SlackItem; spareMin: number; now: number }) {
	const start = useStartWorking();
	const status = useStatus();
	const workingHere = status.data?.mode === "working" && status.data.taskId === item.id;
	return (
		<li className="flex flex-col gap-2 rounded-xl border border-gray-300 bg-white p-4">
			<Link href={`/tasks/${item.id}`} className="flex flex-col gap-1">
				<span className="text-lg font-bold text-gray-900">{item.title}</span>
				<DueLabel dueAt={item.dueAt} now={now} />
			</Link>
			<p className="text-base font-semibold text-gray-900">{gainText(item, spareMin)}</p>
			<p className="text-sm text-gray-600">{REASON_TEXT[item.reason]}</p>
			{start.isError && <ErrorNotice>{errorText(start.error)}</ErrorNotice>}
			<button
				type="button"
				disabled={start.isPending || workingHere}
				onClick={() => start.mutate(item.id)}
				className={btnPrimary}
			>
				{workingHere ? "作業中" : "始める"}
			</button>
		</li>
	);
}

/** 余裕リスト(plan.md §3.6)。余裕のあるタスクを、今やると生み出せる余裕の大きい順に */
export function SlackPage() {
	const now = useNow();
	const [spare, setSpare] = useState<number | undefined>(undefined);
	const list = useSlackList(spare);
	const shown = spare ?? list.data?.spareMin;

	return (
		<div className="flex flex-col gap-4">
			<PageHeader title="余裕リスト" />
			<p className="text-sm text-gray-600">
				余裕のあるタスクを、次の空き時間にやると生み出せる余裕が大きい順に並べます。
			</p>
			<fieldset className="flex flex-wrap items-center gap-2">
				<legend className="mb-1 text-sm font-medium text-gray-700">空き時間の長さ</legend>
				{SPARE_CHOICES.map((m) => (
					<button
						key={m}
						type="button"
						aria-pressed={shown === m}
						onClick={() => setSpare(m)}
						className={`rounded-full border px-4 py-2 text-base font-medium ${
							shown === m
								? "border-blue-600 bg-blue-50 text-blue-900"
								: "border-gray-300 bg-white text-gray-800"
						}`}
					>
						{m}分
					</button>
				))}
				{spare !== undefined && (
					<button
						type="button"
						onClick={() => setSpare(undefined)}
						className="text-sm text-gray-600 underline"
					>
						次の空きに合わせる
					</button>
				)}
			</fieldset>

			<QueryState query={list}>
				{(data) =>
					data.items.length === 0 ? (
						<p className="rounded-xl border border-gray-300 bg-white p-6 text-center text-gray-700">
							余裕のあるタスクはありません
						</p>
					) : (
						<ol className="flex flex-col gap-3">
							{data.items.map((item) => (
								<SlackRow key={item.id} item={item} spareMin={data.spareMin} now={now} />
							))}
						</ol>
					)
				}
			</QueryState>

			<p className="rounded-lg bg-gray-100 px-3 py-2 text-xs leading-relaxed text-gray-600">
				理論上は締切が早いものほど上に来やすい。差がつくのは、まとまった時間が要る・見積もりが読めない・山場の手前、の3つのとき。
			</p>
		</div>
	);
}
