import { useCallback } from "react";
import { Sheet } from "../../components/Sheet";
import { useCreateTasks } from "../../lib/queries";
import { QuickAdd } from "../quick-add/QuickAdd";
import type { TaskCreateInput } from "../quick-add/types";

/** 「＋ 追加」で開く登録シート。保存したらタスクの一覧を更新して閉じる */
export function AddTaskSheet({ onClose }: { onClose: () => void }) {
	const create = useCreateTasks();
	const save = useCallback(
		async (inputs: TaskCreateInput[], onSaved: (index: number) => void) => {
			await create.mutateAsync({ inputs, onSaved });
			onClose();
		},
		[create.mutateAsync, onClose],
	);
	return (
		<Sheet title="課題を追加" onClose={onClose}>
			<QuickAdd onConfirm={save} onCancel={onClose} />
		</Sheet>
	);
}
