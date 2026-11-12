import { TASK_TYPE_OPTIONS, type TaskType } from "core/domain/draft-types";
import { Field, inputClass } from "../../components/ui";

export function TaskTypeSelect({
	value,
	disabled,
	onChange,
}: {
	value: TaskType;
	disabled?: boolean;
	onChange: (value: TaskType) => void;
}) {
	return (
		<Field label="種類">
			<select
				aria-label="種類"
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value as TaskType)}
				className={`${inputClass} min-h-11`}
			>
				{TASK_TYPE_OPTIONS.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</Field>
	);
}
