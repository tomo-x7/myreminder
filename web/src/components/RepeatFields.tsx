import {
	REPEAT_COUNT_MAX,
	REPEAT_END_CHOICES,
	type RepeatDraft,
	type RepeatProblems,
	repeatChoices,
	repeatPreview,
} from "core/domain/repeat-draft";
import { DateInput } from "./DateTimeInputs";
import { chipClass, inputClass } from "./ui";

type Props = {
	repeat: RepeatDraft;
	/** 最初の回の締切。予告と終了日の検証の基準 */
	dueAt: number | null;
	now: number;
	/** 表示してよい問題だけ渡す(保存を押す前は空) */
	problems: RepeatProblems;
	disabled?: boolean;
	onChange: (patch: Partial<RepeatDraft>) => void;
};

/** 繰り返しの選択: なし/毎週/隔週/毎月 → 無期限/回数/終了日 → 次の3回の予告。確認カードと編集画面で共通 */
export function RepeatFields({ repeat, dueAt, now, problems, disabled, onChange }: Props) {
	const preview = repeatPreview(repeat, dueAt, now);
	const error = problems.repeatCount ?? problems.repeatUntil;
	return (
		<fieldset className="flex flex-col gap-1">
			<legend className="mb-1 text-xs text-sub">繰り返し</legend>
			<div className="flex flex-wrap gap-1.5">
				{repeatChoices(repeat).map((c) => (
					<button
						key={c.label}
						type="button"
						aria-pressed={c.selected}
						disabled={disabled}
						onClick={() => onChange({ freq: c.freq, interval: c.interval })}
						className={`${chipClass(c.selected)} disabled:opacity-40`}
					>
						{c.label}
					</button>
				))}
			</div>
			{repeat.freq !== "none" && (
				<>
					<div className="flex flex-wrap items-center gap-1.5">
						{REPEAT_END_CHOICES.map((c) => (
							<button
								key={c.value}
								type="button"
								aria-pressed={repeat.end === c.value}
								disabled={disabled}
								onClick={() => onChange({ end: c.value })}
								className={`${chipClass(repeat.end === c.value)} disabled:opacity-40`}
							>
								{c.label}
							</button>
						))}
						{repeat.end === "count" && (
							<div className="flex items-center gap-1 text-xs text-sub">
								<div className="w-16">
									<input
										type="number"
										inputMode="numeric"
										min={1}
										max={REPEAT_COUNT_MAX}
										aria-label="回数"
										value={repeat.count}
										disabled={disabled}
										onChange={(e) => onChange({ count: e.target.value })}
										className={inputClass}
									/>
								</div>
								回
							</div>
						)}
						{repeat.end === "until" && (
							<div className="w-36">
								<DateInput
									aria-label="終了日"
									value={repeat.until}
									disabled={disabled}
									onChange={(until) => onChange({ until })}
									className={inputClass}
								/>
							</div>
						)}
					</div>
					{error && <p className="text-xs text-danger">{error}</p>}
					{preview && <p className="text-xs text-sub">{preview}</p>}
				</>
			)}
		</fieldset>
	);
}
