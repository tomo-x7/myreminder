import { useId, useState } from "react";
import { ActionSheet } from "../../components/ActionSheet";
import { inputClass } from "../../components/ui";

type Choice = { id: string; name: string; aliases?: readonly string[] };
type Props = {
	courses: readonly Choice[];
	selectedId: string | null;
	valueLabel?: string;
	disabled?: boolean;
	error?: string;
	onSelect: (course: Choice | null) => void;
};
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/g, "");

function CourseChoices({ courses, selectedId, onSelect }: Pick<Props, "courses" | "selectedId" | "onSelect">) {
	const [query, setQuery] = useState("");
	const key = normalize(query);
	const filtered = courses.filter((course) =>
		[course.name, ...(course.aliases ?? [])].some((name) => normalize(name).includes(key)),
	);
	const choiceClass =
		"flex min-h-11 w-full items-center justify-between gap-3 border-b border-line px-2 py-3 text-left text-sm last:border-b-0 active:bg-wash";
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<input
				data-sheet-autofocus
				type="search"
				aria-label="科目を検索"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				autoComplete="off"
				className={`${inputClass} min-h-11 shrink-0`}
			/>
			<div className="min-h-0 overflow-y-auto overscroll-contain">
				<button
					type="button"
					className={choiceClass}
					aria-pressed={selectedId === null}
					onClick={() => onSelect(null)}
				>
					なし
					{selectedId === null && <span aria-hidden="true">✓</span>}
				</button>
				{filtered.map((course) => (
					<button
						key={course.id}
						type="button"
						className={choiceClass}
						aria-pressed={course.id === selectedId}
						onClick={() => onSelect(course)}
					>
						<span className="min-w-0 break-words">{course.name}</span>
						{course.id === selectedId && <span aria-hidden="true">✓</span>}
					</button>
				))}
				{filtered.length === 0 && <output className="block px-2 py-3 text-sm">該当なし</output>}
			</div>
		</div>
	);
}

/** ネイティブの候補ポップアップを使わず、科目を画面内のシートで選ぶ。 */
export function CoursePicker({ courses, selectedId, valueLabel, disabled, error, onSelect }: Props) {
	const [open, setOpen] = useState(false);
	const errorId = useId();
	const valueId = useId();
	const current = courses.find((course) => course.id === selectedId);
	return (
		<>
			<div className="flex min-w-0 flex-col gap-1 text-xs text-sub">
				<span>科目</span>
				<button
					type="button"
					aria-label="科目"
					aria-haspopup="dialog"
					aria-expanded={open}
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? `${valueId} ${errorId}` : valueId}
					disabled={disabled}
					onClick={() => setOpen(true)}
					className={`${inputClass} flex min-h-11 items-center justify-between gap-2 text-left`}
				>
					<span id={valueId} className="truncate">
						{current?.name ?? (valueLabel?.trim() || "なし")}
					</span>
					<svg
						viewBox="0 0 20 20"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						aria-hidden="true"
						className="shrink-0"
					>
						<path d="m5 7.5 5 5 5-5" />
					</svg>
				</button>
				{error && (
					<span id={errorId} className="text-xs text-danger">
						{error}
					</span>
				)}
			</div>
			{open && (
				<ActionSheet title="科目" onClose={() => setOpen(false)}>
					<CourseChoices
						courses={courses}
						selectedId={selectedId}
						onSelect={(course) => {
							onSelect(course);
							setOpen(false);
						}}
					/>
				</ActionSheet>
			)}
		</>
	);
}
