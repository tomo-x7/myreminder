import type { SessionRow } from "core/api/types";
import { formatJstDateTime, formatJstTime } from "core/domain/date";
import { PROGRESS_STEPS } from "core/domain/session";
import { formatDuration } from "core/domain/time-input";
import { fmtDuration } from "core/domain/work-log";
import { useSessionReview } from "core/forms/session";
import { useReviewSessions } from "core/queries/sessions";
import { DatetimeInput } from "../../components/DateTimeInputs";
import { btnSecondary, chipClass, ErrorNotice, inputClass } from "../../components/ui";

function ReviewItem({ session }: { session: SessionRow }) {
	const r = useSessionReview(session);
	const { provisional, byEstimate } = r;

	return (
		<li className="flex flex-col gap-2 border-l-2 border-warn pl-2">
			<div>
				<p className="font-semibold">いつ終わった?</p>
				<p className="text-xs text-sub">
					{session.taskTitle} ・ {formatJstDateTime(session.startAt)}〜
				</p>
			</div>
			<div className="flex flex-col gap-1.5">
				{provisional !== null && (
					<button
						type="button"
						className={btnSecondary}
						disabled={r.confirming}
						onClick={() => r.confirm(provisional)}
					>
						仮の時刻 {formatJstTime(provisional)}({fmtDuration(provisional - session.startAt)})
					</button>
				)}
				<button
					type="button"
					className={btnSecondary}
					disabled={r.confirming}
					onClick={() => r.confirm(byEstimate)}
				>
					開始+見積もり {formatJstDateTime(byEstimate)}({formatDuration(session.taskEstimateMin)})
				</button>
				<div className="flex gap-1.5">
					<DatetimeInput
						className={`${inputClass} min-w-0 flex-1`}
						value={r.customAt}
						onChange={r.setCustomAt}
					/>
					<button
						type="button"
						className={btnSecondary}
						disabled={r.confirming || r.customAt === null}
						onClick={r.confirmCustom}
					>
						確定
					</button>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-1.5 text-xs">
				<span className="text-sub">進捗</span>
				{PROGRESS_STEPS.map((p) => (
					<button
						key={p}
						type="button"
						aria-pressed={r.progress === p}
						className={chipClass(r.progress === p)}
						onClick={() => r.toggleProgress(p)}
					>
						{p}%
					</button>
				))}
			</div>
			<button
				type="button"
				className="self-start text-xs text-danger underline underline-offset-2 disabled:opacity-40"
				disabled={r.removing}
				onClick={() => window.confirm("削除する?") && r.remove()}
			>
				削除
			</button>
			{r.errorMessage && <ErrorNotice>{r.errorMessage}</ErrorNotice>}
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
