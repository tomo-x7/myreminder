import { useState } from "react";
import { Link } from "wouter";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice } from "../../components/ui";
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
		<div className="flex flex-col gap-0.5 rounded-lg bg-gray-100 px-3 py-2">
			{d ? (
				<>
					<p className="text-base font-bold text-gray-900">
						着手デッドライン <span className="tabular-nums">{formatJstDateTime(d.at)}</span>
					</p>
					<p className="text-sm text-gray-700">
						{d.mode === "usual"
							? `この時刻までに始めないと、普段のペースでは収まらなくなる(残り空き ${formatHours(Math.max(0, task.freeUsualMin))} / 必要 ${need})`
							: `この時刻までに始めないと、睡眠を削らずには間に合わない(本気で使える空き ${formatHours(Math.max(0, task.freeHardMin))} / 必要 ${need})`}
					</p>
				</>
			) : (
				<p className="text-sm text-gray-700">
					本気で詰めても、睡眠を削らずには間に合わない見込み(本気で使える空き{" "}
					{formatHours(Math.max(0, task.freeHardMin))} / 必要 {need})
				</p>
			)}
			{task.plannedStartAt !== null ? (
				<p className="text-sm text-gray-700">
					着手予定 {formatJstDateTime(task.plannedStartAt)}
					{task.plannedStartAt < now ? "(過ぎています)" : ""}
				</p>
			) : (
				task.recommendedStart !== null && (
					<p className="text-sm text-gray-700">おすすめの着手 {formatJstDateTime(task.recommendedStart)}</p>
				)
			)}
		</div>
	);
}

/** ホームの「次の1件」。計画のリスクが一番高いタスク */
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
		<section className={`flex flex-col gap-3 rounded-2xl border-4 bg-white p-4 shadow-sm ${style.border}`}>
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-bold tracking-wide text-gray-500">次にやること</p>
				<span className={`rounded-full px-3 py-0.5 text-sm font-bold ${style.badge}`}>
					{RISK_LABEL[task.risk]}
				</span>
			</div>
			<DueLabel dueAt={task.dueAt} now={now} size="lg" />
			<Link href={`/tasks/${task.id}`} className="flex flex-col gap-1">
				<span className="text-2xl leading-snug font-bold text-gray-900">{task.title}</span>
				<span className="text-sm text-gray-600">
					{[course?.name, `見積もり ${formatDuration(task.estimateMin)}`].filter(Boolean).join(" ・ ")}
				</span>
			</Link>
			{task.needsFullEffort && (
				<p className="rounded-md bg-orange-100 px-3 py-2 text-base font-bold text-orange-900">
					普段のペースでは足りない。本気が必要
				</p>
			)}
			<StartDeadline task={task} now={now} />
			{progress && <p className="text-base font-semibold text-gray-800">{progress}</p>}
			{task.firstStep && (
				<p className="rounded-md bg-blue-50 px-3 py-2 text-base text-blue-900">
					<span className="font-bold">まず: </span>
					{task.firstStep}
				</p>
			)}
			{error && <ErrorNotice>{error}</ErrorNotice>}
			<button
				type="button"
				disabled={start.isPending || workingHere}
				onClick={() => start.mutate(task.id)}
				className={`${btnPrimary} py-4 text-lg`}
			>
				{workingHere ? "作業中" : "始める"}
			</button>
			<div className="grid grid-cols-2 gap-2">
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
				<button type="button" onClick={() => setSnoozing(true)} className={`${btnSecondary} col-span-2`}>
					いつに回す?
				</button>
			</div>
			{snoozing && <SnoozeSheet target={task} onClose={() => setSnoozing(false)} />}
		</section>
	);
}
