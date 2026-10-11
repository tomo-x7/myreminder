import { useState } from "react";
import { btnSecondary, chipClass, ErrorNotice, inputClass } from "../../components/ui";
import { formatJstDateTime, formatJstTime, fromDatetimeLocal, toDatetimeLocal } from "core/domain/date";
import { errorText } from "core/domain/errors";
import { fmtDuration } from "core/domain/work-log";
import { type SessionRow } from "core/api/types";
import { useDeleteSession, useReviewSessions, useUpdateSession } from "core/queries/sessions";

const MIN = 60_000;
const PROGRESS_STEPS = [25, 50, 75, 100] as const;

function ReviewItem({ session }: { session: SessionRow }) {
	const update = useUpdateSession();
	const remove = useDeleteSession();
	const [custom, setCustom] = useState(() => toDatetimeLocal(session.endAt ?? session.startAt));
	const [progress, setProgress] = useState<number | null>(null);

	const provisional = session.endAt;
	const byEstimate = session.startAt + session.taskEstimateMin * MIN;
	const confirm = (endAt: number) =>
		update.mutate({
			id: session.id,
			patch: { endAt, review: "confirmed", ...(progress !== null && { progress }) },
		});
	const customMs = fromDatetimeLocal(custom);
	const error = update.error ?? remove.error;

	return (
		<li className="flex flex-col gap-2 border-l-2 border-warn pl-2">
			<div>
				<p className="font-semibold">いつ終わった?</p>
				<p className="text-xs text-sub">
					「{session.taskTitle}」を {formatJstDateTime(session.startAt)} から作業中のままでした
				</p>
			</div>
			<div className="flex flex-col gap-1.5">
				{provisional !== null && (
					<button
						type="button"
						className={btnSecondary}
						disabled={update.isPending}
						onClick={() => confirm(provisional)}
					>
						仮の時刻のまま: {formatJstTime(provisional)}({fmtDuration(provisional - session.startAt)})
					</button>
				)}
				<button
					type="button"
					className={btnSecondary}
					disabled={update.isPending}
					onClick={() => confirm(byEstimate)}
				>
					開始 + 見積もり: {formatJstDateTime(byEstimate)}({session.taskEstimateMin}分)
				</button>
				<div className="flex gap-1.5">
					<input
						type="datetime-local"
						className={`${inputClass} min-w-0 flex-1`}
						value={custom}
						onChange={(e) => setCustom(e.target.value)}
					/>
					<button
						type="button"
						className={btnSecondary}
						disabled={update.isPending || customMs === null}
						onClick={() => customMs !== null && confirm(customMs)}
					>
						この時刻
					</button>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-1.5 text-xs">
				<span className="text-sub">進み具合(任意)</span>
				{PROGRESS_STEPS.map((p) => (
					<button
						key={p}
						type="button"
						aria-pressed={progress === p}
						className={chipClass(progress === p)}
						onClick={() => setProgress(progress === p ? null : p)}
					>
						{p}%
					</button>
				))}
			</div>
			<button
				type="button"
				className="self-start text-xs text-danger underline underline-offset-2 disabled:opacity-40"
				disabled={remove.isPending}
				onClick={() => window.confirm("この作業記録を削除しますか?") && remove.mutate(session.id)}
			>
				この記録を削除
			</button>
			{error && <ErrorNotice>{errorText(error)}</ErrorNotice>}
		</li>
	);
}

/** 消し忘れで「確認待ち」になった作業記録に、いつ終わったかを聞く。なければ何も出さない */
export function ReviewPrompt() {
	const review = useReviewSessions();
	if (!review.data || review.data.length === 0) return null;
	return (
		<ul className="flex flex-col gap-2">
			{review.data.map((s) => (
				<ReviewItem key={s.id} session={s} />
			))}
		</ul>
	);
}
