// 作業記録の追加・編集・確認待ちの確定。日時は epoch ms か null(未入力)で持つ。画面の部品との変換は画面の層でする
import { useMemo, useState } from "react";
import type { SessionCreate, SessionPatch, SessionRow } from "../api/types";
import { MINUTE } from "../domain/date";
import { errorText } from "../domain/errors";
import { groupSessionsByDay, reviewEndOptions, reviewPatch, sessionRange } from "../domain/session";
import { useNow } from "../hooks/use-now";
import { useCreateSession, useDeleteSession, useSessions, useUpdateSession } from "../queries/sessions";
import { useTaskOptions } from "../queries/tasks";
import { floorToMinute, isValid, type Problems } from "./common";

export type SessionForm = {
	startAt: number | null;
	endAt: number | null;
	/** 0〜100(null なら進捗なし) */
	progress: number | null;
};

export type SessionFormProblems = Problems<"startAt" | "endAt">;

/** 記録の値から入れ直す。終了前の記録(作業中)は終了を開始と同じにする。入力欄は分までなので秒以下は切り捨てる */
export function sessionToForm(s: Pick<SessionRow, "startAt" | "endAt" | "progress">): SessionForm {
	return { startAt: floorToMinute(s.startAt), endAt: floorToMinute(s.endAt ?? s.startAt), progress: s.progress };
}

/** 追加の初期値。直近1時間 */
export function emptySessionForm(now: number): SessionForm {
	return { startAt: floorToMinute(now - 60 * MINUTE), endAt: floorToMinute(now), progress: null };
}

export function validateSessionForm(f: SessionForm): SessionFormProblems {
	const problems: SessionFormProblems = {};
	if (f.startAt === null) problems.startAt = "開始を入力してください";
	if (f.endAt === null) problems.endAt = "終了を入力してください";
	return problems;
}

/** 検証を通ったときだけ更新の入力にする(終了が開始より前なら API が invalid_range を返す) */
export function sessionFormToPatch(f: SessionForm): SessionPatch | null {
	if (f.startAt === null || f.endAt === null || !isValid(validateSessionForm(f))) return null;
	return { startAt: f.startAt, endAt: f.endAt, progress: f.progress };
}

export function sessionFormToCreate(f: SessionForm, taskId: string): SessionCreate | null {
	if (f.startAt === null || f.endAt === null || !taskId || !isValid(validateSessionForm(f))) return null;
	return { taskId, startAt: f.startAt, endAt: f.endAt, progress: f.progress };
}

/** 作業記録の一覧。JST の日ごと(新しい順)にまとめ、「さらに前を見る」で期間を広げる */
export function useSessionLog(initialDays = 14, moreDays = 14) {
	const now = useNow(60_000);
	const [days, setDays] = useState(initialDays);
	const { from, to } = sessionRange(now, days);
	const sessions = useSessions(from, to);
	const groups = useMemo(() => groupSessionsByDay(sessions.data ?? []), [sessions.data]);
	return { sessions, groups, loadMore: () => setDays(days + moreDays) };
}

/** 記録1件の編集と削除。編集を始めるたびに、いまの記録の値から入れ直す(やめた編集の値を引きずらない) */
export function useSessionEdit(session: SessionRow) {
	const update = useUpdateSession();
	const remove = useDeleteSession();
	const [editing, setEditing] = useState(false);
	const [form, setForm] = useState<SessionForm>(() => sessionToForm(session));
	const error = update.error ?? remove.error;

	return {
		editing,
		/** 終わっている記録だけ編集・削除できる */
		canEdit: !editing && session.endAt !== null,
		form,
		change: (patch: Partial<SessionForm>) => setForm((f) => ({ ...f, ...patch })),
		startEdit: () => {
			setForm(sessionToForm(session));
			update.reset();
			setEditing(true);
		},
		cancel: () => setEditing(false),
		save: () => {
			const patch = sessionFormToPatch(form);
			if (!patch) return;
			update.mutate({ id: session.id, patch }, { onSuccess: () => setEditing(false) });
		},
		saving: update.isPending,
		remove: () => remove.mutate(session.id),
		removing: remove.isPending,
		errorMessage: error ? errorText(error) : null,
	};
}

/** 記録の追加。タスクを選んで、開始と終了(初期値は直近1時間)を入れる */
export function useSessionAdd(onDone: () => void) {
	const tasks = useTaskOptions();
	const create = useCreateSession();
	const [taskId, setTaskId] = useState("");
	const [form, setForm] = useState<SessionForm>(() => emptySessionForm(Date.now()));
	const input = sessionFormToCreate(form, taskId);

	return {
		tasks: tasks.data,
		taskId,
		setTaskId,
		form,
		change: (patch: Partial<SessionForm>) => setForm((f) => ({ ...f, ...patch })),
		canSubmit: input !== null && !create.isPending,
		submit: () => input && create.mutate(input, { onSuccess: onDone }),
		errorMessage: create.error ? errorText(create.error) : null,
	};
}

/** 確認待ちの記録1件に「いつ終わった?」を聞く。仮の時刻・開始+見積もり・好きな時刻のどれかで確定する */
export function useSessionReview(session: SessionRow) {
	const update = useUpdateSession();
	const remove = useDeleteSession();
	const [customAt, setCustomAt] = useState<number | null>(() => floorToMinute(session.endAt ?? session.startAt));
	const [progress, setProgress] = useState<number | null>(null);
	const error = update.error ?? remove.error;

	return {
		...reviewEndOptions(session),
		customAt,
		setCustomAt,
		progress,
		/** 選んでいる進捗をもう一度選ぶと外す */
		toggleProgress: (p: number) => setProgress(progress === p ? null : p),
		confirm: (endAt: number) => update.mutate({ id: session.id, patch: reviewPatch(endAt, progress) }),
		confirmCustom: () =>
			customAt !== null && update.mutate({ id: session.id, patch: reviewPatch(customAt, progress) }),
		confirming: update.isPending,
		remove: () => remove.mutate(session.id),
		removing: remove.isPending,
		errorMessage: error ? errorText(error) : null,
	};
}
