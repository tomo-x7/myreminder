import { useState } from "react";
import {
	btnGhost,
	btnPrimary,
	btnSecondary,
	chipClass,
	ErrorNotice,
	inputClass,
	StaleNotice,
} from "../../components/ui";
import { DAY, formatJstTime, startOfJstDay } from "core/domain/date";
import { errorText } from "core/domain/errors";
import { fmtClock } from "core/domain/work-log";
import { type SetStatusInput } from "core/api/types";
import { useNow } from "core/hooks/use-now";
import { useSetStatus, useStartWorking, useStatus, useStopWorking } from "core/queries/status";
import { useTaskOptions } from "core/queries/tasks";

const MIN = 60_000;
type Mode = SetStatusInput["mode"];

// Discord 風のステータス。色は点だけ(通常は白抜き)
const LABEL: Record<string, { text: string; dot: string }> = {
	normal: { text: "通常", dot: "border border-sub" },
	working: { text: "作業中", dot: "bg-ink" },
	busy: { text: "取り込み中", dot: "bg-danger" },
	sleep: { text: "おやすみ", dot: "bg-faint" },
};

const MODE_BUTTONS: { mode: Mode; label: string }[] = [
	{ mode: "normal", label: "通常" },
	{ mode: "busy", label: "取り込み中" },
	{ mode: "sleep", label: "おやすみ" },
];

const PROGRESS_STEPS = [25, 50, 75, 100] as const;
const AGO_PRESETS = [10, 30, 60] as const;

/** 現在のステータス(Discord 風)と、手動の切り替え・作業の開始と終了 */
export function StatusSwitcher({ compact = false }: { compact?: boolean }) {
	const status = useStatus();
	const setStatus = useSetStatus();
	const start = useStartWorking();
	const stop = useStopWorking();
	const tasks = useTaskOptions();
	const working = status.data?.mode === "working";
	const now = useNow(working ? 1000 : 30_000);

	const [pickedMode, setPickedMode] = useState<Mode | null>(null);
	const [stopping, setStopping] = useState(false);
	const [agoMin, setAgoMin] = useState(0);
	const [taskId, setTaskId] = useState("");
	// compact: 手動の切り替えとタスク選びは、開くまで隠す(ホームでは場所を取らない)
	const [expanded, setExpanded] = useState(false);

	if (status.isPending) return <p className="text-xs text-faint">読み込み中…</p>;
	// データがあるうちの再取得の失敗では、作業を終えるボタンを消さない(下に注意だけ出す)
	if (status.data === undefined) return <p className="text-xs text-danger">ステータスを取得できませんでした</p>;

	const s = status.data;
	const meta = LABEL[s.mode] ?? LABEL.normal;
	const error = [setStatus.error, start.error, stop.error].find(Boolean);

	const applyMode = (mode: Mode, until: number | null) => {
		setStatus.mutate({ mode, until }, { onSuccess: () => setPickedMode(null) });
	};
	const presets = (mode: Mode) => {
		const t = Date.now();
		const list: { label: string; until: number | null }[] = [
			{ label: "30分", until: t + 30 * MIN },
			{ label: "1時間", until: t + 60 * MIN },
			{ label: "今日中", until: startOfJstDay(t) + DAY },
		];
		// 通常に期限なしはない(= 手動設定の解除)
		list.push({ label: mode === "normal" ? "自動に任せる" : "解除するまで", until: null });
		return list;
	};

	const openSession = s.openSession;
	const elapsed = openSession ? now - openSession.startAt : 0;
	const doStop = (progress: (typeof PROGRESS_STEPS)[number] | 0) => {
		const endAt = agoMin > 0 ? Date.now() - agoMin * MIN : undefined;
		stop.mutate(
			{ progress, endAt },
			{
				onSuccess: () => {
					setStopping(false);
					setAgoMin(0);
				},
			},
		);
	};

	return (
		<section className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${meta.dot}`} />
				<p className="min-w-0 flex-1 truncate">
					<span className="font-semibold">
						{meta.text}
						{s.mode === "working" && s.taskTitle ? `: ${s.taskTitle}` : ""}
						{s.mode === "busy" && s.label ? `: ${s.label}` : ""}
					</span>
					<span className="ml-2 text-xs text-sub">
						{s.mode === "working" && openSession
							? `${formatJstTime(openSession.startAt)} から ${fmtClock(elapsed)}`
							: s.until
								? `${formatJstTime(s.until)} まで${s.source === "auto" ? "(自動)" : ""}`
								: s.source === "manual"
									? "解除するまで(手動)"
									: "自動で切り替わります"}
					</span>
				</p>
				{!working && compact && (
					<button type="button" className={btnGhost} onClick={() => setExpanded(!expanded)}>
						{expanded ? "閉じる" : "変更"}
					</button>
				)}
			</div>

			{working ? (
				stopping ? (
					<div className="flex flex-col gap-2 border-l-2 border-ink pl-3">
						<p className="text-xs font-semibold">どれくらい進んだ?</p>
						<div className="grid grid-cols-4 gap-1.5">
							{PROGRESS_STEPS.map((p) => (
								<button
									key={p}
									type="button"
									className={btnSecondary}
									disabled={stop.isPending}
									onClick={() => doStop(p)}
								>
									{p}%
								</button>
							))}
						</div>
						<button
							type="button"
							className="self-start text-xs text-sub underline underline-offset-2"
							disabled={stop.isPending}
							onClick={() => doStop(0)}
						>
							ほとんど進まなかった(0%)
						</button>
						<div className="flex flex-wrap items-center gap-1.5 text-xs">
							<span>いつ終わった?</span>
							<button type="button" className={chipClass(agoMin === 0)} onClick={() => setAgoMin(0)}>
								今
							</button>
							{AGO_PRESETS.map((m) => (
								<button
									key={m}
									type="button"
									className={chipClass(agoMin === m)}
									onClick={() => setAgoMin(m)}
								>
									{m}分前
								</button>
							))}
							<label className="flex items-center gap-1">
								<input
									type="number"
									min={1}
									inputMode="numeric"
									className={`${inputClass} w-14 py-0.5`}
									value={agoMin || ""}
									onChange={(e) => setAgoMin(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
								/>
								分前に終わった
							</label>
						</div>
						<button
							type="button"
							className="self-start text-xs text-sub underline underline-offset-2"
							onClick={() => setStopping(false)}
						>
							まだ続ける
						</button>
					</div>
				) : (
					<button type="button" className={btnPrimary} onClick={() => setStopping(true)}>
						作業を終える
					</button>
				)
			) : compact && !expanded ? null : (
				<>
					<div className="flex flex-col gap-2">
						<div className="flex gap-1.5">
							{MODE_BUTTONS.map((m) => (
								<button
									key={m.mode}
									type="button"
									className={chipClass(pickedMode === m.mode)}
									onClick={() => setPickedMode(pickedMode === m.mode ? null : m.mode)}
								>
									{m.label}
								</button>
							))}
						</div>
						{pickedMode && (
							<div className="flex flex-wrap gap-1.5">
								{presets(pickedMode).map((p) => (
									<button
										key={p.label}
										type="button"
										className={btnSecondary}
										disabled={setStatus.isPending}
										onClick={() => applyMode(pickedMode, p.until)}
									>
										{p.label}
									</button>
								))}
							</div>
						)}
						{s.source === "manual" && !pickedMode && (
							<button
								type="button"
								className="self-start text-xs text-sub underline underline-offset-2"
								onClick={() => applyMode("normal", null)}
							>
								手動の設定を解除して自動に戻す
							</button>
						)}
					</div>

					<div className="flex gap-1.5">
						<select
							className={`${inputClass} min-w-0 flex-1`}
							value={taskId}
							onChange={(e) => setTaskId(e.target.value)}
						>
							<option value="">作業するタスクを選ぶ</option>
							{tasks.data?.map((t) => (
								<option key={t.id} value={t.id}>
									{t.title}
								</option>
							))}
						</select>
						<button
							type="button"
							className={btnPrimary}
							disabled={!taskId || start.isPending}
							onClick={() => start.mutate(taskId, { onSuccess: () => setTaskId("") })}
						>
							始める
						</button>
					</div>
				</>
			)}

			{error && <ErrorNotice>{errorText(error)}</ErrorNotice>}
			{status.isError && <StaleNotice onRetry={() => status.refetch()} />}
		</section>
	);
}
