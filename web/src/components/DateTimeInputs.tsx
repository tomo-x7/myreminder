import { fromDatetimeLocal, toDatetimeLocal } from "core/domain/date";
import { fromDateInput, minuteToTimeInput, timeInputToMinute, toDateInput } from "core/domain/time-input";
import { type InputHTMLAttributes, useState } from "react";

// core のフォームは日時を epoch ms、時刻を「JST 0時からの分」で持つ。ここで input の文字列と変換する。
// 入力の途中(欄が欠けていて値が空になる間)は、打った文字列をそのまま残す

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
	/** 未入力・入力の途中は null */
	value: number | null;
	onChange: (value: number | null) => void;
};

function ConvertedInput({
	type,
	value,
	onChange,
	toText,
	fromText,
	...rest
}: Props & { type: string; toText: (v: number) => string; fromText: (s: string) => number | null }) {
	const [text, setText] = useState(() => (value === null ? "" : toText(value)));
	// 外から値が変わったとき(時限を選んだ、終了を自動で入れたなど)は、その値の表記に合わせる
	const shown = fromText(text) === value ? text : value === null ? "" : toText(value);
	return (
		<input
			{...rest}
			type={type}
			value={shown}
			onChange={(e) => {
				setText(e.target.value);
				onChange(fromText(e.target.value));
			}}
		/>
	);
}

/** 日時(日本時間)。値は epoch ms */
export const DatetimeInput = (props: Props) => (
	<ConvertedInput {...props} type="datetime-local" toText={toDatetimeLocal} fromText={fromDatetimeLocal} />
);

/** 日付(日本時間)。値はその日の 0:00 の epoch ms */
export const DateInput = (props: Props) => (
	<ConvertedInput {...props} type="date" toText={toDateInput} fromText={fromDateInput} />
);

/** 時刻。値は 0時からの分 */
export const TimeInput = (props: Props) => (
	<ConvertedInput {...props} type="time" toText={minuteToTimeInput} fromText={timeInputToMinute} />
);
