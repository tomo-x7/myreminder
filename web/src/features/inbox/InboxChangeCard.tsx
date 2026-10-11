import type { InboxChange } from "core/api/types";
import { formatDue } from "core/domain/date";
import { changeMeta, openSourceLabel } from "core/domain/inbox";
import { useInboxChangeActions } from "core/forms/inbox";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice, linkClass } from "../../components/ui";

/** 紐付け済みのタスクへの、取り込み元の変更の提案。[反映] でタスクを直し、[無視] で提案だけ消す */
export function InboxChangeCard({ item, now }: { item: InboxChange; now: number }) {
	const actions = useInboxChangeActions(item.id);
	const { dueAt, title } = item.change;

	return (
		<li className="flex flex-col gap-2 py-2">
			<div className="flex flex-col gap-0.5">
				<p className="text-base font-semibold">{item.taskTitle}</p>
				<p className="flex flex-wrap items-baseline gap-x-2 text-xs text-sub">
					{changeMeta(item)}
					{item.url && (
						<a href={item.url} target="_blank" rel="noreferrer" className={linkClass}>
							{openSourceLabel(item.source)}
						</a>
					)}
				</p>
			</div>

			<dl className="flex flex-col gap-1.5">
				{dueAt && (
					<div className="flex flex-col border-l-2 border-warn pl-2">
						<dt className="text-xs font-semibold text-warn">締切が変更</dt>
						<dd className="text-xs text-sub">現在: {formatDue(item.taskDueAt, now)}</dd>
						<dd className="flex flex-wrap items-baseline gap-x-1.5">
							<span className="text-xs text-sub">取り込み元:</span>
							<DueLabel dueAt={dueAt.to} now={now} />
						</dd>
					</div>
				)}
				{title && (
					<div className="flex flex-col border-l-2 border-warn pl-2">
						<dt className="text-xs font-semibold text-warn">タイトルが変更</dt>
						<dd className="text-xs text-sub">現在: {item.taskTitle}</dd>
						<dd className="font-semibold">取り込み元: {title.to}</dd>
					</div>
				)}
			</dl>

			{actions.errorMessage && <ErrorNotice>{actions.errorMessage}</ErrorNotice>}

			<div className="flex gap-1.5">
				<button
					type="button"
					disabled={actions.busy}
					onClick={actions.accept}
					className={`${btnPrimary} flex-1`}
				>
					反映
				</button>
				<button
					type="button"
					disabled={actions.busy}
					onClick={actions.dismiss}
					className={`${btnSecondary} flex-1`}
				>
					無視
				</button>
			</div>
		</li>
	);
}
