import { useState } from "react";
import { ActionSheet } from "../../components/ActionSheet";
import { btnPrimary, btnSecondary } from "../../components/ui";

type Props = {
	title: string;
	disabled?: boolean;
	canQuiet?: boolean;
	label?: string;
	primary?: boolean;
	onComplete: (silent: boolean) => void;
};

/** 通常の完了は直接実行し、別の完了方法は隣のタップ領域から選ぶ。 */
export function CompleteAction({ title, disabled, canQuiet = true, label = "完了", primary, onComplete }: Props) {
	const [choosing, setChoosing] = useState(false);
	return (
		<>
			<div className="inline-flex shrink-0 items-stretch">
				<button
					type="button"
					className={`${primary ? btnPrimary : btnSecondary} min-h-11 ${canQuiet ? "rounded-r-none" : ""}`}
					disabled={disabled}
					onClick={() => onComplete(false)}
					aria-label={`${title}を完了`}
				>
					{label}
				</button>
				{canQuiet && (
					<button
						type="button"
						className={`${btnSecondary} -ml-px min-h-11 min-w-11 rounded-l-none px-2`}
						disabled={disabled}
						onClick={() => setChoosing(true)}
						aria-label={`${title}の完了方法`}
						aria-haspopup="dialog"
						aria-expanded={choosing}
					>
						<svg
							viewBox="0 0 24 24"
							width="18"
							height="18"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
					</button>
				)}
			</div>
			{choosing && (
				<ActionSheet title={title} onClose={() => setChoosing(false)}>
					<button
						type="button"
						className={`${btnSecondary} min-h-12 w-full justify-start px-4 text-left`}
						disabled={disabled}
						aria-label={`${title}を通知せず完了`}
						onClick={() => {
							setChoosing(false);
							onComplete(true);
						}}
					>
						通知せず完了
					</button>
				</ActionSheet>
			)}
		</>
	);
}
