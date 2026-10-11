// ステータスの切り替え・作業の開始と終了。画面は表示と、部品の選択だけ持つ
import { useState } from "react";
import { errorText } from "../domain/errors";
import {
	type StatusMode,
	type StopProgress,
	statusDetail,
	statusHeadline,
	statusPresets,
	stopEndAt,
} from "../domain/status";
import { useNow } from "../hooks/use-now";
import { useSetStatus, useStartWorking, useStatus, useStopWorking } from "../queries/status";
import { useTaskOptions } from "../queries/tasks";

/**
 * 現在のステータスと、手動の切り替え・作業の開始と終了の状態。
 * 作業中は経過時間を出すので 1 秒ごとに、それ以外は 30 秒ごとに now を更新する
 */
export function useStatusSwitcher() {
	const status = useStatus();
	const setStatus = useSetStatus();
	const start = useStartWorking();
	const stop = useStopWorking();
	const tasks = useTaskOptions();
	const working = status.data?.mode === "working";
	const now = useNow(working ? 1000 : 30_000);

	const [pickedMode, setPickedMode] = useState<StatusMode | null>(null);
	const [stopping, setStopping] = useState(false);
	const [agoMin, setAgoMin] = useState(0);
	const [taskId, setTaskId] = useState("");
	// 手動の切り替えとタスク選びを開いているか(画面が隠したいときに使う)
	const [expanded, setExpanded] = useState(false);

	const data = status.data;
	const error = [setStatus.error, start.error, stop.error].find(Boolean);

	const applyMode = (mode: StatusMode, until: number | null) => {
		setStatus.mutate({ mode, until }, { onSuccess: () => setPickedMode(null) });
	};

	return {
		/** 取得の状態(読み込み中・失敗・再取得)。data が undefined の間は status を出せない */
		status,
		current: data,
		working,
		headline: data ? statusHeadline(data) : "",
		detail: data ? statusDetail(data, now) : "",
		errorMessage: error ? errorText(error) : null,
		// 手動の切り替え
		pickedMode,
		/** もう一度選ぶと閉じる */
		pickMode: (mode: StatusMode) => setPickedMode(pickedMode === mode ? null : mode),
		presets: pickedMode ? statusPresets(pickedMode, Date.now()) : [],
		applyMode,
		/** 手動の設定を解除して自動に戻す */
		clearManual: () => applyMode("normal", null),
		switching: setStatus.isPending,
		expanded,
		toggleExpanded: () => setExpanded(!expanded),
		// 作業を始める
		tasks: tasks.data,
		taskId,
		setTaskId,
		startWorking: () => start.mutate(taskId, { onSuccess: () => setTaskId("") }),
		starting: start.isPending,
		// 作業を終える
		stopping,
		setStopping,
		agoMin,
		setAgoMin,
		/** 進捗を添えて作業を終える。何分前に終わったかを選んでいればその時刻にする */
		stopWith: (progress: StopProgress) => {
			stop.mutate(
				{ progress, endAt: stopEndAt(agoMin, Date.now()) },
				{
					onSuccess: () => {
						setStopping(false);
						setAgoMin(0);
					},
				},
			);
		},
		stopPending: stop.isPending,
	};
}
