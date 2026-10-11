import type { Course, PlanTask } from "core/api/types";
import { nextMeta, startDeadlineView } from "core/domain/next-card";
import { RISK_LABEL } from "core/domain/schedule";
import { useNextActions } from "core/screens/next-card";
import { useState } from "react";
import { Link } from "wouter";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice, Notice } from "../../components/ui";
import { RISK_STYLE } from "./risk-style";
import { SnoozeSheet } from "./SnoozeSheet";

/** 着手デッドラインと、その正直な根拠(plan.md §2.2-1) */
function StartDeadline({ task, now }: { task: PlanTask; now: number }) {
	const { deadline, reason, start } = startDeadlineView(task, now);
	return (
		<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5">
			<dt className="text-xs text-sub">着手デッドライン</dt>
			<dd className={deadline ? "font-semibold" : "font-semibold text-danger"}>{deadline ?? "なし"}</dd>
			<dd className="col-span-2 text-xs text-sub">{reason}</dd>
			{start && (
				<>
					<dt className="text-xs text-sub">{start.label}</dt>
					<dd className={start.late ? "text-danger" : ""}>{start.text}</dd>
				</>
			)}
		</dl>
	);
}

/** ホームの「次の1件」。計画のリスクが一番高いタスク。リスクは左の線と文字色で示す */
export function NextCard({ task, course, now }: { task: PlanTask; course: Course | undefined; now: number }) {
	const actions = useNextActions(task);
	const [snoozing, setSnoozing] = useState(false);
	const style = RISK_STYLE[task.risk];

	return (
		<section className={`flex flex-col gap-2 border-l-2 pl-3 ${style.border}`}>
			<div className="flex items-baseline justify-between gap-2 text-xs">
				<span className="text-sub">次にやること</span>
				<span className={style.text}>{RISK_LABEL[task.risk]}</span>
			</div>
			<div className="flex flex-col gap-0.5">
				<DueLabel dueAt={task.dueAt} now={now} size="lg" />
				<Link href={`/tasks/${task.id}`} className="text-base leading-snug font-bold">
					{task.title}
				</Link>
				<p className="text-xs text-sub">{nextMeta(task, course)}</p>
			</div>
			{task.needsFullEffort && <Notice tone="danger">普段のペースでは足りない。本気が必要</Notice>}
			<StartDeadline task={task} now={now} />
			{task.firstStep && (
				<p>
					<span className="mr-1.5 text-xs text-sub">まず</span>
					{task.firstStep}
				</p>
			)}
			{actions.error && <ErrorNotice>{actions.error}</ErrorNotice>}
			<div className="flex gap-1.5">
				<button
					type="button"
					disabled={actions.startDisabled}
					onClick={actions.start}
					className={`${btnPrimary} flex-1`}
				>
					{actions.working ? "作業中" : "始める"}
				</button>
				<button
					type="button"
					disabled={actions.updating}
					onClick={() => actions.setStatus("done")}
					className={btnSecondary}
				>
					完了
				</button>
				<button
					type="button"
					disabled={actions.updating}
					onClick={() => actions.setStatus("submitted")}
					className={btnSecondary}
				>
					提出済み
				</button>
				<button type="button" onClick={() => setSnoozing(true)} className={btnSecondary}>
					いつに回す?
				</button>
			</div>
			{snoozing && <SnoozeSheet target={task} onClose={() => setSnoozing(false)} />}
		</section>
	);
}
