import { useState } from "react";
import { Link } from "wouter";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice, Notice } from "../../components/ui";
import { formatJstDateTime } from "../../lib/date";
import type { Course } from "../../lib/queries";
import { useUpdateTask } from "../../lib/queries";
import { formatDuration } from "../../lib/time-input";
import { errorText, useStartWorking, useStatus } from "../status";
import { formatHours, progressText, RISK_LABEL, RISK_STYLE, startDeadline } from "./format";
import type { PlanTask } from "./hooks";
import { SnoozeSheet } from "./SnoozeSheet";

/** 着手デッドラインと、その正直な根拠(plan.md §2.2-1) */
function StartDeadline({ task, now }: { task: PlanTask; now: number }) {
	const d = startDeadline(task);
	const need = formatHours(task.remainingP80);
	return (
		<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5">
			<dt className="text-xs text-sub">着手デッドライン</dt>
			<dd className={d ? "font-semibold" : "font-semibold text-danger"}>
				{d ? formatJstDateTime(d.at) : "なし"}
			</dd>
			<dd className="col-span-2 text-xs text-sub">
				{d === null
					? `本気で詰めても、睡眠を削らずには間に合わない見込み(本気で使える空き ${formatHours(Math.max(0, task.freeHardMin))} / 必要 ${need})`
					: d.mode === "usual"
						? `この時刻までに始めないと、普段のペースでは収まらなくなる(残り空き ${formatHours(Math.max(0, task.freeUsualMin))} / 必要 ${need})`
						: `この時刻までに始めないと、睡眠を削らずには間に合わない(本気で使える空き ${formatHours(Math.max(0, task.freeHardMin))} / 必要 ${need})`}
			</dd>
			{task.plannedStartAt !== null ? (
				<>
					<dt className="text-xs text-sub">着手予定</dt>
					<dd className={task.plannedStartAt < now ? "text-danger" : ""}>
						{formatJstDateTime(task.plannedStartAt)}
						{task.plannedStartAt < now ? "(過ぎています)" : ""}
					</dd>
				</>
			) : (
				task.recommendedStart !== null && (
					<>
						<dt className="text-xs text-sub">おすすめの着手</dt>
						<dd>{formatJstDateTime(task.recommendedStart)}</dd>
					</>
				)
			)}
		</dl>
	);
}

/** ホームの「次の1件」。計画のリスクが一番高いタスク。リスクは左の線と文字色で示す */
export function NextCard({ task, course, now }: { task: PlanTask; course: Course | undefined; now: number }) {
	const update = useUpdateTask();
	const start = useStartWorking();
	const status = useStatus();
	const [snoozing, setSnoozing] = useState(false);
	const style = RISK_STYLE[task.risk];
	const workingHere = status.data?.mode === "working" && status.data.taskId === task.id;
	const progress = progressText(task);
	const error = update.error?.message ?? (start.error ? errorText(start.error) : null);

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
				<p className="text-xs text-sub">
					{[course?.name, `見積もり ${formatDuration(task.estimateMin)}`, progress]
						.filter(Boolean)
						.join(" ・ ")}
				</p>
			</div>
			{task.needsFullEffort && <Notice tone="danger">普段のペースでは足りない。本気が必要</Notice>}
			<StartDeadline task={task} now={now} />
			{task.firstStep && (
				<p>
					<span className="mr-1.5 text-xs text-sub">まず</span>
					{task.firstStep}
				</p>
			)}
			{error && <ErrorNotice>{error}</ErrorNotice>}
			<div className="flex gap-1.5">
				<button
					type="button"
					disabled={start.isPending || workingHere}
					onClick={() => start.mutate(task.id)}
					className={`${btnPrimary} flex-1`}
				>
					{workingHere ? "作業中" : "始める"}
				</button>
				<button
					type="button"
					disabled={update.isPending}
					onClick={() => update.mutate({ id: task.id, patch: { status: "done" } })}
					className={btnSecondary}
				>
					完了
				</button>
				<button
					type="button"
					disabled={update.isPending}
					onClick={() => update.mutate({ id: task.id, patch: { status: "submitted" } })}
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
