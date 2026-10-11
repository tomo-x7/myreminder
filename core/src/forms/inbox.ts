// 受信箱の1件ごとの操作([追加] [紐付け] [無視]、変更の反映)。画面は表示と、部品の選択だけ持つ
import { useState } from "react";
import type { InboxItem, Task } from "../api/types";
import {
	type CourseOption,
	type DraftPatch,
	draftToInput,
	hasProblems,
	patchDraft,
	validateDraft,
} from "../domain/draft";
import type { Draft } from "../domain/draft-types";
import { errorText } from "../domain/errors";
import { linkableTasks } from "../domain/inbox";
import { itemToDraft } from "../domain/inbox-draft";
import { useAcceptChange, useAcceptItem, useDismissChange, useIgnoreItem, useLinkItem } from "../queries/inbox";

export type InboxPanel = "add" | "link" | null;

/**
 * 承認待ちの1件。重複の候補があれば [紐付け] を先に開く。
 * [追加] を開くと取り込み元の内容から確認カードの下書きを作り、パネルを切り替えても下書きは残す
 */
export function useInboxItemForm(item: InboxItem, courses: readonly CourseOption[], tasks: readonly Task[]) {
	const hasCandidates = item.candidates.length > 0;
	const [panel, setPanel] = useState<InboxPanel>(hasCandidates ? "link" : null);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [showProblems, setShowProblems] = useState(false);
	const [otherTaskId, setOtherTaskId] = useState("");
	const accept = useAcceptItem();
	const link = useLinkItem();
	const ignore = useIgnoreItem();
	const error = accept.error ?? link.error ?? ignore.error;

	return {
		panel,
		openLink: () => setPanel("link"),
		openAdd: () => {
			setDraft((d) => d ?? itemToDraft(item, courses));
			setPanel("add");
		},
		hasCandidates,
		// 追加
		draft,
		problems: draft ? validateDraft(draft) : {},
		showProblems,
		editDraft: (patch: DraftPatch) => setDraft((d) => (d ? patchDraft(d, patch) : d)),
		/** 検証を通ったら承認する(タスクとして保存) */
		save: () => {
			if (!draft) return;
			if (hasProblems(validateDraft(draft))) {
				setShowProblems(true);
				return;
			}
			accept.mutate({ id: item.id, input: draftToInput(draft, courses) });
		},
		saving: accept.isPending,
		// 紐付け
		linkable: linkableTasks(tasks, item.candidates),
		otherTaskId,
		setOtherTaskId,
		linkTo: (taskId: string) => link.mutate({ id: item.id, taskId }),
		/** 選んだタスクに紐付ける */
		linkSelected: () => {
			if (otherTaskId !== "") link.mutate({ id: item.id, taskId: otherTaskId });
		},
		ignore: () => ignore.mutate(item.id),
		busy: accept.isPending || link.isPending || ignore.isPending,
		errorMessage: error ? errorText(error) : null,
	};
}

/** 紐付け済みのタスクへの、取り込み元の変更の提案。[反映] でタスクを直し、[そのまま] で提案だけ消す */
export function useInboxChangeActions(id: string) {
	const accept = useAcceptChange();
	const dismiss = useDismissChange();
	const error = accept.error ?? dismiss.error;
	return {
		accept: () => accept.mutate(id),
		dismiss: () => dismiss.mutate(id),
		busy: accept.isPending || dismiss.isPending,
		errorMessage: error ? errorText(error) : null,
	};
}
