// 通知・報告に出す数量の表記(ai-docs/specs/ui.md「文言」10)。core/domain/time-input.ts・schedule.ts の formatDuration / formatHours と同じ形
// 純粋関数だけ。policy.ts・webhook.ts・services/status.ts が共有する

/** 90 → `1h30m`、45 → `45m`、120 → `2h`。分は四捨五入 */
export function formatDuration(minutes: number): string {
	const total = Math.max(0, Math.round(minutes));
	const h = Math.floor(total / 60);
	const m = total % 60;
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h${m}m`;
}

/** 270 → `4.5h`、40 → `40m`。空きや余裕の量。負の値は符号を付ける */
export function formatHours(minutes: number): string {
	const sign = minutes < 0 ? "-" : "";
	const abs = Math.abs(minutes);
	if (abs < 60) return `${sign}${Math.round(abs)}m`;
	return `${sign}${Math.round((abs / 60) * 10) / 10}h`;
}
