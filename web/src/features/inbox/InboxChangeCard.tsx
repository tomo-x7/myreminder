import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice } from "../../components/ui";
import { formatDue } from "../../lib/date";
import { SOURCE_LABEL } from "./draft";
import { type InboxChange, useAcceptChange, useDismissChange } from "./hooks";

/** 紐付け済みのタスクへの、取り込み元の変更の提案。[反映] でタスクを直し、[そのまま] で提案だけ消す */
export function InboxChangeCard({ item, now }: { item: InboxChange; now: number }) {
	const accept = useAcceptChange();
	const dismiss = useDismissChange();
	const busy = accept.isPending || dismiss.isPending;
	const error = accept.error ?? dismiss.error;
	const { dueAt, title } = item.change;

	return (
		<li className="flex flex-col gap-3 rounded-xl border border-amber-400 bg-amber-50 p-4">
			<div className="flex flex-col gap-1">
				<p className="text-lg font-bold text-gray-900">{item.taskTitle}</p>
				<p className="text-xs text-gray-600">
					{[item.courseName, SOURCE_LABEL[item.source] ?? item.source].filter(Boolean).join(" ・ ")}
				</p>
				{item.url && (
					<a
						href={item.url}
						target="_blank"
						rel="noreferrer"
						className="w-fit text-sm font-medium text-blue-700 underline"
					>
						{item.source === "classroom" ? "Classroom で開く" : "取り込み元で開く"}
					</a>
				)}
			</div>

			<dl className="flex flex-col gap-2 text-sm">
				{dueAt && (
					<div className="flex flex-col gap-0.5">
						<dt className="font-semibold text-amber-900">締切が変わっています</dt>
						<dd className="text-gray-700">いま: {formatDue(item.taskDueAt, now)}</dd>
						<dd className="flex flex-col gap-0.5 text-gray-900">
							<span>取り込み元:</span>
							<DueLabel dueAt={dueAt.to} now={now} />
						</dd>
					</div>
				)}
				{title && (
					<div className="flex flex-col gap-0.5">
						<dt className="font-semibold text-amber-900">タイトルが変わっています</dt>
						<dd className="text-gray-700">いま: {item.taskTitle}</dd>
						<dd className="font-semibold text-gray-900">取り込み元: {title.to}</dd>
					</div>
				)}
			</dl>

			{error && <ErrorNotice>{error.message}</ErrorNotice>}

			<div className="flex gap-2">
				<button
					type="button"
					disabled={busy}
					onClick={() => accept.mutate(item.id)}
					className={`${btnPrimary} flex-1`}
				>
					反映
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => dismiss.mutate(item.id)}
					className={`${btnSecondary} flex-1`}
				>
					そのまま
				</button>
			</div>
		</li>
	);
}
