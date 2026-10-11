import type { InboxChange } from "core/api/types";
import { formatDue } from "core/domain/date";
import { errorText } from "core/domain/errors";
import { SOURCE_LABEL } from "core/domain/inbox-draft";
import { useAcceptChange, useDismissChange } from "core/queries/inbox";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice, linkClass } from "../../components/ui";

/** 紐付け済みのタスクへの、取り込み元の変更の提案。[反映] でタスクを直し、[そのまま] で提案だけ消す */
export function InboxChangeCard({ item, now }: { item: InboxChange; now: number }) {
	const accept = useAcceptChange();
	const dismiss = useDismissChange();
	const busy = accept.isPending || dismiss.isPending;
	const error = accept.error ?? dismiss.error;
	const { dueAt, title } = item.change;

	return (
		<li className="flex flex-col gap-2 py-2">
			<div className="flex flex-col gap-0.5">
				<p className="text-base font-semibold">{item.taskTitle}</p>
				<p className="flex flex-wrap items-baseline gap-x-2 text-xs text-sub">
					{[item.courseName, SOURCE_LABEL[item.source] ?? item.source].filter(Boolean).join(" ・ ")}
					{item.url && (
						<a href={item.url} target="_blank" rel="noreferrer" className={linkClass}>
							{item.source === "classroom" ? "Classroom で開く" : "取り込み元で開く"}
						</a>
					)}
				</p>
			</div>

			<dl className="flex flex-col gap-1.5">
				{dueAt && (
					<div className="flex flex-col border-l-2 border-warn pl-2">
						<dt className="text-xs font-semibold text-warn">締切が変わっています</dt>
						<dd className="text-xs text-sub">いま: {formatDue(item.taskDueAt, now)}</dd>
						<dd className="flex flex-wrap items-baseline gap-x-1.5">
							<span className="text-xs text-sub">取り込み元:</span>
							<DueLabel dueAt={dueAt.to} now={now} />
						</dd>
					</div>
				)}
				{title && (
					<div className="flex flex-col border-l-2 border-warn pl-2">
						<dt className="text-xs font-semibold text-warn">タイトルが変わっています</dt>
						<dd className="text-xs text-sub">いま: {item.taskTitle}</dd>
						<dd className="font-semibold">取り込み元: {title.to}</dd>
					</div>
				)}
			</dl>

			{error && <ErrorNotice>{errorText(error)}</ErrorNotice>}

			<div className="flex gap-1.5">
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
