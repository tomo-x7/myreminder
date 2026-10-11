import { Sheet } from "../../components/Sheet";
import { QuickAdd } from "../quick-add/QuickAdd";

/** 「＋ 追加」で開く登録シート。手入力のカードから始まり、保存したらタスクの一覧を更新して閉じる */
export function AddTaskSheet({ onClose }: { onClose: () => void }) {
	return (
		<Sheet title="追加" onClose={onClose}>
			<QuickAdd onDone={onClose} />
		</Sheet>
	);
}
