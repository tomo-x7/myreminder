import { useState } from "react";
import { Link } from "wouter";
import { DueLabel } from "../components/DueLabel";
import {
	btnSecondary,
	chipClass,
	Empty,
	ErrorNotice,
	listClass,
	Notice,
	PageHeader,
	QueryState,
} from "../components/ui";
import { formatShort } from "core/domain/schedule";
import { type SlackItem } from "core/api/types";
import { useSlackList } from "core/queries/schedule";
import { errorText } from "core/domain/errors";
import { useStartWorking, useStatus } from "core/queries/status";
import { useNow } from "core/hooks/use-now";

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
		<li className="flex items-start gap-2 py-2">
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<Link href={`/tasks/${item.id}`} className="flex flex-col">
					<span className="font-semibold">{item.title}</span>
					<DueLabel dueAt={item.dueAt} now={now} />
				</Link>
				<p className="text-xs font-medium">{gainText(item, spareMin)}</p>
				<p className="text-xs text-sub">{REASON_TEXT[item.reason]}</p>
				{start.isError && <ErrorNotice>{errorText(start.error)}</ErrorNotice>}
			</div>
			<button
				type="button"
				disabled={start.isPending || workingHere}
				onClick={() => start.mutate(item.id)}
				className={`${btnSecondary} shrink-0`}
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
		<div className="flex flex-col gap-3">
			<PageHeader title="余裕リスト" />
			<p className="text-xs text-sub">
				余裕のあるタスクを、次の空き時間にやると生み出せる余裕が大きい順に並べます。
			</p>
			<fieldset className="flex flex-wrap items-center gap-1.5">
				<legend className="sr-only">空き時間の長さ</legend>
				<span aria-hidden="true" className="text-xs text-sub">
					空き時間の長さ
				</span>
				{SPARE_CHOICES.map((m) => (
					<button
						key={m}
						type="button"
						aria-pressed={shown === m}
						onClick={() => setSpare(m)}
						className={chipClass(shown === m)}
					>
						{m}分
					</button>
				))}
				{spare !== undefined && (
					<button
						type="button"
						onClick={() => setSpare(undefined)}
						className="text-xs text-sub underline underline-offset-2"
					>
						次の空きに合わせる
					</button>
				)}
			</fieldset>

			<QueryState query={list}>
				{(data) =>
					data.items.length === 0 ? (
						<Empty>余裕のあるタスクはありません</Empty>
					) : (
						<ol className={`${listClass} border-t`}>
							{data.items.map((item) => (
								<SlackRow key={item.id} item={item} spareMin={data.spareMin} now={now} />
							))}
						</ol>
					)
				}
			</QueryState>

			<Notice>
				理論上は締切が早いものほど上に来やすい。差がつくのは、まとまった時間が要る・見積もりが読めない・山場の手前、の3つのとき。
			</Notice>
		</div>
	);
}
