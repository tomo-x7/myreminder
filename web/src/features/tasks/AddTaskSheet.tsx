import { useCallback } from "react";
import { Sheet } from "../../components/Sheet";
import { useCreateTasks } from "../../lib/queries";
import { QuickAdd } from "../quick-add/QuickAdd";

/** 「＋ 追加」で開く登録シート。保存したらタスクの一覧を更新して閉じる */
export function AddTaskSheet({ onClose }: { onClose: () => void }) {
	const create = useCreateTasks();
	const save = useCallback(
		async (inputs: Parameters<typeof create.mutateAsync>[0]) => {
			await create.mutateAsync(inputs);
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
