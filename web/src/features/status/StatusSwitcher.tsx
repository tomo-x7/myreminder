import { useState } from "react";
import {
	errorText,
	type SetStatusInput,
	useNow,
	useSetStatus,
	useStartWorking,
	useStatus,
	useStopWorking,
	useTaskOptions,
} from "./hooks";
import { DAY, fmtClock, fmtTime, startOfJstDay } from "./time";

const MIN = 60_000;
type Mode = SetStatusInput["mode"];

const LABEL: Record<string, { icon: string; text: string; tone: string }> = {
	normal: { icon: "🟢", text: "通常", tone: "border-green-300 bg-green-50 text-green-900" },
	working: { icon: "🛠", text: "作業中", tone: "border-blue-300 bg-blue-50 text-blue-900" },
	busy: { icon: "🔴", text: "取り込み中", tone: "border-red-300 bg-red-50 text-red-900" },
	sleep: { icon: "🌙", text: "おやすみ", tone: "border-indigo-300 bg-indigo-50 text-indigo-900" },
};

const MODE_BUTTONS: { mode: Mode; label: string }[] = [
	{ mode: "normal", label: "🟢 通常" },
	{ mode: "busy", label: "🔴 取り込み中" },
	{ mode: "sleep", label: "🌙 おやすみ" },
];

const PROGRESS_STEPS = [25, 50, 75, 100] as const;
const AGO_PRESETS = [10, 30, 60] as const;

const btn = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm active:bg-gray-100 disabled:opacity-50";

/** 現在のステータス(Discord 風)と、手動の切り替え・作業の開始と終了 */
export function StatusSwitcher() {
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

	if (status.isPending) return <p className="text-sm text-gray-500">読み込み中…</p>;
	if (status.isError) return <p className="text-sm text-red-600">ステータスを取得できませんでした</p>;

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
		<section className="flex flex-col gap-3">
			<div className={`rounded-xl border p-3 ${meta.tone}`}>
				<p className="text-lg font-semibold">
					{meta.icon} {meta.text}
					{s.mode === "working" && s.taskTitle ? `: ${s.taskTitle}` : ""}
					{s.mode === "busy" && s.label ? `: ${s.label}` : ""}
				</p>
				<p className="text-sm opacity-80">
					{s.mode === "working" && openSession
						? `${fmtTime(openSession.startAt)} から ${fmtClock(elapsed)}`
						: s.until
							? `${fmtTime(s.until)} まで${s.source === "auto" ? "(自動)" : ""}`
							: s.source === "manual"
								? "解除するまで(手動)"
								: "自動で切り替わります"}
				</p>
			</div>

			{working ? (
				stopping ? (
					<div className="flex flex-col gap-3 rounded-xl border border-gray-300 p-3">
						<p className="font-semibold">どれくらい進んだ?</p>
						<div className="grid grid-cols-4 gap-2">
							{PROGRESS_STEPS.map((p) => (
								<button
									key={p}
									type="button"
									className={btn}
									disabled={stop.isPending}
									onClick={() => doStop(p)}
								>
									{p}%
								</button>
							))}
						</div>
						<button
							type="button"
							className="self-start text-xs text-gray-500 underline"
							onClick={() => doStop(0)}
						>
							ほとんど進まなかった(0%)
						</button>
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<span>いつ終わった?</span>
							<button
								type="button"
								className={`${btn} ${agoMin === 0 ? "border-blue-500 bg-blue-50" : ""}`}
								onClick={() => setAgoMin(0)}
							>
								今
							</button>
							{AGO_PRESETS.map((m) => (
								<button
									key={m}
									type="button"
									className={`${btn} ${agoMin === m ? "border-blue-500 bg-blue-50" : ""}`}
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
									className="w-16 rounded-lg border border-gray-300 px-2 py-2"
									value={agoMin || ""}
									onChange={(e) => setAgoMin(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
								/>
								分前に終わった
							</label>
						</div>
						<button
							type="button"
							className="self-start text-sm text-gray-500 underline"
							onClick={() => setStopping(false)}
						>
							まだ続ける
						</button>
					</div>
				) : (
					<button
						type="button"
						className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white active:bg-blue-700"
						onClick={() => setStopping(true)}
					>
						作業を終える
					</button>
				)
			) : (
				<>
					<div className="flex flex-col gap-2">
						<div className="grid grid-cols-3 gap-2">
							{MODE_BUTTONS.map((m) => (
								<button
									key={m.mode}
									type="button"
									className={`${btn} ${pickedMode === m.mode ? "border-blue-500 bg-blue-50" : ""}`}
									onClick={() => setPickedMode(pickedMode === m.mode ? null : m.mode)}
								>
									{m.label}
								</button>
							))}
						</div>
						{pickedMode && (
							<div className="grid grid-cols-4 gap-2">
								{presets(pickedMode).map((p) => (
									<button
										key={p.label}
										type="button"
										className={btn}
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
								className="self-start text-sm text-gray-500 underline"
								onClick={() => applyMode("normal", null)}
							>
								手動の設定を解除して自動に戻す
							</button>
						)}
					</div>

					<div className="flex gap-2">
						<select
							className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
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
							className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
							disabled={!taskId || start.isPending}
							onClick={() => start.mutate(taskId, { onSuccess: () => setTaskId("") })}
						>
							🛠 始める
						</button>
					</div>
				</>
			)}

			{error && (
				<p role="alert" className="text-sm text-red-600">
					{errorText(error)}
				</p>
			)}
		</section>
	);
}
