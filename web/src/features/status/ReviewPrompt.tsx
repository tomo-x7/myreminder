import { useState } from "react";
import { errorText, type SessionRow, useDeleteSession, useReviewSessions, useUpdateSession } from "./hooks";
import { fmtDateTime, fmtDuration, fmtTime, fromInput, toInput } from "./time";

const MIN = 60_000;
const btn =
	"rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm active:bg-gray-100 disabled:opacity-50";
const PROGRESS_STEPS = [25, 50, 75, 100] as const;

function ReviewItem({ session }: { session: SessionRow }) {
	const update = useUpdateSession();
	const remove = useDeleteSession();
	const [custom, setCustom] = useState(() => toInput(session.endAt ?? session.startAt));
	const [progress, setProgress] = useState<number | null>(null);

	const provisional = session.endAt;
	const byEstimate = session.startAt + session.taskEstimateMin * MIN;
	const confirm = (endAt: number) =>
		update.mutate({
			id: session.id,
			patch: { endAt, review: "confirmed", ...(progress !== null && { progress }) },
		});
	const customMs = fromInput(custom);
	const error = update.error ?? remove.error;

	return (
		<li className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
			<div>
				<p className="font-semibold">いつ終わった?</p>
				<p className="text-sm text-gray-700">
					「{session.taskTitle}」を {fmtDateTime(session.startAt)} から作業中のままでした
				</p>
			</div>
			<div className="flex flex-col gap-2">
				{provisional !== null && (
					<button
						type="button"
						className={btn}
						disabled={update.isPending}
						onClick={() => confirm(provisional)}
					>
						仮の時刻のまま: {fmtTime(provisional)}({fmtDuration(provisional - session.startAt)})
					</button>
				)}
				<button type="button" className={btn} disabled={update.isPending} onClick={() => confirm(byEstimate)}>
					開始 + 見積もり: {fmtDateTime(byEstimate)}({session.taskEstimateMin}分)
				</button>
				<div className="flex gap-2">
					<input
						type="datetime-local"
						className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
						value={custom}
						onChange={(e) => setCustom(e.target.value)}
					/>
					<button
						type="button"
						className={btn}
						disabled={update.isPending || customMs === null}
						onClick={() => customMs !== null && confirm(customMs)}
					>
						この時刻
					</button>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span>進み具合(任意)</span>
				{PROGRESS_STEPS.map((p) => (
					<button
						key={p}
						type="button"
						className={`${btn} ${progress === p ? "border-blue-500 bg-blue-50" : ""}`}
						onClick={() => setProgress(progress === p ? null : p)}
					>
						{p}%
					</button>
				))}
			</div>
			<button
				type="button"
				className="self-start text-sm text-red-600 underline"
				disabled={remove.isPending}
				onClick={() => window.confirm("この作業記録を削除しますか?") && remove.mutate(session.id)}
			>
				この記録を削除
			</button>
			{error && (
				<p role="alert" className="text-sm text-red-600">
					{errorText(error)}
				</p>
			)}
		</li>
	);
}

/** 消し忘れで「確認待ち」になった作業記録に、いつ終わったかを聞く。なければ何も出さない */
export function ReviewPrompt() {
	const review = useReviewSessions();
	if (!review.data || review.data.length === 0) return null;
	return (
		<ul className="flex flex-col gap-3">
			{review.data.map((s) => (
				<ReviewItem key={s.id} session={s} />
			))}
		</ul>
	);
}
