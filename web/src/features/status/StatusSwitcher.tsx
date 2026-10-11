import { PROGRESS_STEPS } from "core/domain/session";
import { AGO_PRESETS, MODE_BUTTONS, parseAgoMin } from "core/domain/status";
import { useStatusSwitcher } from "core/forms/status";
import {
	btnGhost,
	btnPrimary,
	btnSecondary,
	chipClass,
	ErrorNotice,
	inputClass,
	StaleNotice,
} from "../../components/ui";

// Discord 風のステータス。色は点だけ(通常は白抜き)
const DOT: Record<string, string> = {
	normal: "border border-sub",
	working: "bg-ink",
	busy: "bg-danger",
	sleep: "bg-faint",
};

export function StatusSwitcher({ compact = false }: { compact?: boolean }) {
	const f = useStatusSwitcher();
	const { status, current: s, working, pickedMode } = f;

	if (status.isPending) return <p className="text-xs text-faint">読み込み中…</p>;
	// データがあるうちの再取得の失敗では、作業を終えるボタンを消さない(下に注意だけ出す)
	if (s === undefined) return <p className="text-xs text-danger">ステータス取得エラー</p>;

	return (
		<section className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[s.mode] ?? DOT.normal}`} />
				<p className="min-w-0 flex-1 truncate">
					<span className="font-semibold">{f.headline}</span>
					<span className="ml-2 text-xs text-sub">{f.detail}</span>
				</p>
				{!working && compact && (
					<button type="button" className={btnGhost} onClick={f.toggleExpanded}>
						{f.expanded ? "閉じる" : "変更"}
					</button>
				)}
			</div>

			{working ? (
				f.stopping ? (
					<div className="flex flex-col gap-2 border-l-2 border-ink pl-3">
						<p className="text-xs font-semibold">進捗</p>
						<div className="grid grid-cols-4 gap-1.5">
							{PROGRESS_STEPS.map((p) => (
								<button
									key={p}
									type="button"
									className={btnSecondary}
									disabled={f.stopPending}
									onClick={() => f.stopWith(p)}
								>
									{p}%
								</button>
							))}
						</div>
						<button
							type="button"
							className="self-start text-xs text-sub underline underline-offset-2"
							disabled={f.stopPending}
							onClick={() => f.stopWith(0)}
						>
							0%
						</button>
						<div className="flex flex-wrap items-center gap-1.5 text-xs">
							<span>終了</span>
							<button type="button" className={chipClass(f.agoMin === 0)} onClick={() => f.setAgoMin(0)}>
								今
							</button>
							{AGO_PRESETS.map((m) => (
								<button
									key={m}
									type="button"
									className={chipClass(f.agoMin === m)}
									onClick={() => f.setAgoMin(m)}
								>
									{m}分前
								</button>
							))}
							<label className="flex items-center gap-1">
								<input
									type="number"
									min={1}
									inputMode="numeric"
									className={`${inputClass} w-14! py-0.5`}
									value={f.agoMin || ""}
									onChange={(e) => f.setAgoMin(parseAgoMin(e.target.value))}
								/>
								分前
							</label>
						</div>
						<button
							type="button"
							className="self-start text-xs text-sub underline underline-offset-2"
							onClick={() => f.setStopping(false)}
						>
							続ける
						</button>
					</div>
				) : (
					<button type="button" className={btnPrimary} onClick={() => f.setStopping(true)}>
						終了
					</button>
				)
			) : compact && !f.expanded ? null : (
				<>
					<div className="flex flex-col gap-2">
						<div className="flex gap-1.5">
							{MODE_BUTTONS.map((m) => (
								<button
									key={m.mode}
									type="button"
									className={chipClass(pickedMode === m.mode)}
									onClick={() => f.pickMode(m.mode)}
								>
									{m.label}
								</button>
							))}
						</div>
						{pickedMode && (
							<div className="flex flex-wrap gap-1.5">
								{f.presets.map((p) => (
									<button
										key={p.label}
										type="button"
										className={btnSecondary}
										disabled={f.switching}
										onClick={() => f.applyMode(pickedMode, p.until)}
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
								onClick={f.clearManual}
							>
								自動に戻す
							</button>
						)}
					</div>

					<div className="flex gap-1.5">
						<select
							className={`${inputClass} min-w-0 flex-1`}
							value={f.taskId}
							onChange={(e) => f.setTaskId(e.target.value)}
						>
							<option value="">タスク</option>
							{f.tasks?.map((t) => (
								<option key={t.id} value={t.id}>
									{t.title}
								</option>
							))}
						</select>
						<button
							type="button"
							className={btnPrimary}
							disabled={!f.taskId || f.starting}
							onClick={f.startWorking}
						>
							始める
						</button>
					</div>
				</>
			)}

			{f.errorMessage && <ErrorNotice>{f.errorMessage}</ErrorNotice>}
			{status.isError && <StaleNotice onRetry={() => status.refetch()} />}
		</section>
	);
}
