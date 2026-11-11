import { useEffect, useId, useRef, useState } from "react";
import { inputClass } from "../../components/ui";

type Choice = { id: string; name: string; aliases?: readonly string[] };
type Props = {
	courses: readonly Choice[];
	selectedId: string | null;
	valueLabel?: string;
	disabled?: boolean;
	error?: string;
	/** 追加画面は未登録名も下書きとして保持する。編集では登録候補の確定を必要とする。 */
	onInput?: (text: string) => void;
	onSelect: (course: Choice | null) => void;
};
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/g, "");
const namesOf = (course: Choice) => [course.name, ...(course.aliases ?? [])];

/** 入力欄の直下で補完する。ブラウザ標準のdatalistや別画面へは移動しない。 */
export function CoursePicker({ courses, selectedId, valueLabel, disabled, error, onInput, onSelect }: Props) {
	const current = courses.find((course) => course.id === selectedId);
	const label = current?.name ?? valueLabel ?? "";
	const [query, setQuery] = useState(label);
	const [open, setOpen] = useState(false);
	const [focused, setFocused] = useState(false);
	const [active, setActive] = useState(-1);
	const [listHeight, setListHeight] = useState(192);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const pointerInside = useRef(false);
	const composing = useRef(false);
	const pendingSelection = useRef(false);
	const inputId = useId();
	const listId = useId();
	const errorId = useId();
	const key = normalize(query);
	const filtered = courses.filter((course) => namesOf(course).some((name) => normalize(name).includes(key)));
	const options: (Choice | null)[] = key ? filtered : [null, ...filtered];
	const exact = key ? courses.find((course) => namesOf(course).some((name) => normalize(name) === key)) : null;
	const showError = !focused && !open && Boolean(error);

	useEffect(() => {
		if (!pendingSelection.current) setQuery(label);
	}, [label]);

	useEffect(() => {
		// 編集画面では未確定の文字列を残して以前の科目IDを保存してしまわない。
		inputRef.current?.setCustomValidity(!onInput && key && !exact ? "候補から科目を選択してください" : "");
	}, [key, exact, onInput]);

	useEffect(() => {
		// 一覧の取得前に入力した完全一致も、取得後に正しいIDへ結び付ける。
		if (!onInput && pendingSelection.current && exact) {
			pendingSelection.current = false;
			if (exact.id !== selectedId) onSelect(exact);
		}
	}, [exact, selectedId, onInput, onSelect]);

	useEffect(() => {
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) setOpen(false);
		};
		const release = () => {
			pointerInside.current = false;
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("pointerup", release);
		document.addEventListener("pointercancel", release);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("pointerup", release);
			document.removeEventListener("pointercancel", release);
		};
	}, []);

	useEffect(() => {
		if (!open) return;
		let frame = 0;
		const viewport = window.visualViewport;
		const position = () => {
			setListHeight(Math.max(44, Math.min(192, Math.floor((viewport?.height ?? window.innerHeight) * 0.35))));
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const wrapper = wrapperRef.current;
				if (!wrapper) return;
				const top = (viewport?.offsetTop ?? 0) + 8;
				const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 60;
				const box = wrapper.getBoundingClientRect();
				const delta = box.bottom > bottom ? box.bottom - bottom : box.top < top ? box.top - top : 0;
				if (!delta) return;
				let ancestor = wrapper.parentElement;
				while (ancestor) {
					if (
						/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY) &&
						ancestor.scrollHeight > ancestor.clientHeight
					) {
						ancestor.scrollTop += delta;
						break;
					}
					ancestor = ancestor.parentElement;
				}
			});
		};
		position();
		const observer = new ResizeObserver(position);
		if (wrapperRef.current) observer.observe(wrapperRef.current);
		viewport?.addEventListener("resize", position);
		viewport?.addEventListener("scroll", position);
		window.addEventListener("resize", position);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			viewport?.removeEventListener("resize", position);
			viewport?.removeEventListener("scroll", position);
			window.removeEventListener("resize", position);
		};
	}, [open]);

	const choose = (course: Choice | null) => {
		pendingSelection.current = false;
		setQuery(course?.name ?? "");
		inputRef.current?.setCustomValidity("");
		onInput?.(course?.name ?? "");
		onSelect(course);
		inputRef.current?.focus({ preventScroll: true });
		setOpen(false);
		setActive(-1);
	};

	return (
		<div
			ref={wrapperRef}
			className="flex min-w-0 flex-col gap-1 text-xs text-sub"
			onPointerDownCapture={() => {
				pointerInside.current = true;
			}}
		>
			<label htmlFor={inputId}>科目</label>
			<div className="relative">
				<input
					ref={inputRef}
					id={inputId}
					type="text"
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={open}
					aria-controls={listId}
					aria-activedescendant={
						open && active >= 0 && active < options.length ? `${listId}-${active}` : undefined
					}
					aria-invalid={showError || undefined}
					aria-describedby={showError ? errorId : undefined}
					autoComplete="off"
					disabled={disabled}
					value={query}
					onFocus={() => {
						setFocused(true);
						setOpen(true);
					}}
					onBlur={(event) => {
						setFocused(false);
						if (
							pointerInside.current ||
							(event.relatedTarget instanceof Node && wrapperRef.current?.contains(event.relatedTarget))
						)
							return;
						if (exact) setQuery(exact.name);
						setOpen(false);
					}}
					onCompositionStart={() => {
						composing.current = true;
					}}
					onCompositionEnd={() => {
						composing.current = false;
					}}
					onChange={(event) => {
						const text = event.target.value;
						setQuery(text);
						setOpen(true);
						setActive(0);
						onInput?.(text);
						const normalized = normalize(text);
						const match = courses.find((course) =>
							namesOf(course).some((name) => normalize(name) === normalized),
						);
						pendingSelection.current = Boolean(normalized && !match);
						if (match || !normalized) onSelect(match ?? null);
					}}
					onKeyDown={(event) => {
						if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
							return;
						if (event.key === "ArrowDown" || event.key === "ArrowUp") {
							event.preventDefault();
							setOpen(true);
							const next =
								event.key === "ArrowDown"
									? (active + 1) % options.length
									: active <= 0
										? options.length - 1
										: active - 1;
							setActive(options.length ? next : -1);
							requestAnimationFrame(() =>
								document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" }),
							);
						} else if (event.key === "Enter" && open && active >= 0 && active < options.length) {
							event.preventDefault();
							choose(options[active]);
						} else if (event.key === "Escape" && open) {
							event.preventDefault();
							event.stopPropagation();
							setOpen(false);
							setActive(-1);
						} else if (event.key === "Tab") setOpen(false);
					}}
					className={`${inputClass} min-h-11 pr-11 text-base`}
				/>
				{query && (
					<button
						type="button"
						tabIndex={-1}
						disabled={disabled}
						aria-label="科目をクリア"
						onClick={() => {
							choose(null);
							setOpen(true);
						}}
						className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center text-sub active:bg-wash"
					>
						<svg
							viewBox="0 0 24 24"
							width="16"
							height="16"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<path d="m6 6 12 12M18 6 6 18" />
						</svg>
					</button>
				)}
			</div>
			{open && (
				<div
					id={listId}
					role="listbox"
					aria-label="科目の候補"
					style={{ maxHeight: listHeight }}
					className="overflow-y-auto overscroll-contain rounded-sm border border-line bg-paper"
				>
					{options.map((course, index) => (
						<button
							key={course?.id ?? "none"}
							id={`${listId}-${index}`}
							type="button"
							role="option"
							tabIndex={-1}
							aria-selected={course ? course.id === selectedId : !selectedId}
							onClick={() => choose(course)}
							onMouseDown={(event) => event.preventDefault()}
							className={`flex min-h-11 w-full items-center justify-between gap-2 border-b border-line px-2 py-3 text-left text-sm last:border-b-0 active:bg-wash ${active === index ? "bg-wash" : ""}`}
						>
							<span className="min-w-0 break-words">{course?.name ?? "なし"}</span>
							{(course ? course.id === selectedId : !selectedId) && <span aria-hidden="true">✓</span>}
						</button>
					))}
					{options.length === 0 && <output className="block px-2 py-3 text-sm">該当なし</output>}
				</div>
			)}
			{showError && (
				<span id={errorId} className="text-xs text-danger">
					{error}
				</span>
			)}
		</div>
	);
}
