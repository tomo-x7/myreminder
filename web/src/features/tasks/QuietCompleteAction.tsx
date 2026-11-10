import { btnGhost } from "../../components/ui";

type Props = {
	title: string;
	disabled?: boolean;
	onComplete: () => void;
};

/** 通常の完了より奥に置く、一度だけの非通知操作。 */
export function QuietCompleteAction({ title, disabled, onComplete }: Props) {
	return (
		<details className="self-start text-sm">
			<summary className="cursor-pointer py-1 text-sub" aria-label={`${title}の操作`}>
				操作
			</summary>
			<button
				type="button"
				className={btnGhost}
				disabled={disabled}
				onClick={onComplete}
				aria-label={`${title}を通知せず完了`}
			>
				通知せず完了
			</button>
		</details>
	);
}
