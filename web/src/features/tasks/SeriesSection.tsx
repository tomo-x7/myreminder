import type { Task } from "core/api/types";
import { useTaskSeries } from "core/forms/task";
import { RepeatFields } from "../../components/RepeatFields";
import { btnDanger, btnGhost, btnSecondary, ErrorNotice } from "../../components/ui";

/** 編集画面の繰り返し。シリーズなら何回目かと「以降を止める」、そうでなければ「繰り返す」 */
export function SeriesSection({ task, now }: { task: Task; now: number }) {
	const s = useTaskSeries(task);

	if (s.inSeries) {
		// シリーズを読み込むまでは何も出さない
		if (!s.line) return null;
		return (
			<section className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
				<p>{s.line}</p>
				{s.stopError && <ErrorNotice>停止失敗: {s.stopError}</ErrorNotice>}
				{!s.stopped && (
					<button
						type="button"
						className={`${btnDanger} self-start`}
						disabled={s.stopping}
						onClick={() => {
							if (window.confirm("以降を止める?")) s.stop();
						}}
					>
						{s.stopping ? "停止中…" : "以降を止める"}
					</button>
				)}
			</section>
		);
	}

	return (
		<section className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
			{s.open ? (
				<>
					<RepeatFields
						repeat={s.draft}
						dueAt={task.dueAt}
						now={now}
						problems={s.problems}
						disabled={s.setting}
						onChange={s.patch}
					/>
					{s.setError && <ErrorNotice>設定失敗: {s.setError}</ErrorNotice>}
					<div className="flex gap-2">
						<button type="button" className={btnGhost} disabled={s.setting} onClick={s.hide}>
							やめる
						</button>
						<button
							type="button"
							className={btnSecondary}
							disabled={s.setting || !s.canSubmit}
							onClick={s.submit}
						>
							{s.setting ? "設定中…" : "設定"}
						</button>
					</div>
				</>
			) : (
				<button type="button" className={`${btnSecondary} self-start`} onClick={s.show}>
					繰り返す
				</button>
			)}
		</section>
	);
}
