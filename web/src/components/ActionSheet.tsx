import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

/** タッチ端末の表示領域とキーボードに追従する、フォーカスを閉じ込めた選択シート。 */
export function ActionSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const closeRef = useRef(onClose);
	closeRef.current = onClose;
	const titleId = useId();

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const viewport = window.visualViewport;
		const resize = () => {
			dialog.style.top = `${viewport?.offsetTop ?? 0}px`;
			dialog.style.left = `${viewport?.offsetLeft ?? 0}px`;
			dialog.style.width = `${viewport?.width ?? window.innerWidth}px`;
			dialog.style.height = `${viewport?.height ?? window.innerHeight}px`;
		};
		const cancel = (event: Event) => {
			event.preventDefault();
			closeRef.current();
		};
		const keepEscapeInside = (event: KeyboardEvent) => {
			if (event.key === "Escape") event.stopPropagation();
		};
		const backdrop = (event: MouseEvent) => {
			if (event.target === dialog) closeRef.current();
		};
		resize();
		dialog.showModal();
		// スマホでは検索欄へ自動フォーカスしてキーボードを開かない。
		const preferred = dialog.querySelector<HTMLElement>("[data-sheet-autofocus]");
		if (preferred && !window.matchMedia("(pointer: coarse)").matches) preferred.focus({ preventScroll: true });
		dialog.addEventListener("cancel", cancel);
		dialog.addEventListener("keydown", keepEscapeInside);
		dialog.addEventListener("click", backdrop);
		viewport?.addEventListener("resize", resize);
		viewport?.addEventListener("scroll", resize);
		window.addEventListener("resize", resize);
		return () => {
			dialog.removeEventListener("cancel", cancel);
			dialog.removeEventListener("keydown", keepEscapeInside);
			dialog.removeEventListener("click", backdrop);
			viewport?.removeEventListener("resize", resize);
			viewport?.removeEventListener("scroll", resize);
			window.removeEventListener("resize", resize);
			dialog.close();
			document.body.style.overflow = previousOverflow;
			if (opener?.isConnected && !opener.matches(":disabled")) opener.focus({ preventScroll: true });
		};
	}, []);

	return createPortal(
		<dialog
			ref={dialogRef}
			aria-labelledby={titleId}
			className="fixed m-0 flex max-h-none max-w-none flex-col justify-end border-0 bg-black/30 p-0 text-ink backdrop:bg-transparent"
		>
			<div className="mx-auto flex max-h-[calc(100%-1rem)] min-h-0 w-full max-w-xl flex-col rounded-t-lg bg-paper shadow-edge">
				<header className="flex shrink-0 items-center justify-between gap-3 border-b border-line pl-4">
					<h2 id={titleId} className="min-w-0 py-3 text-base font-semibold break-words">
						{title}
					</h2>
					<button
						type="button"
						aria-label={`${title}を閉じる`}
						onClick={() => closeRef.current()}
						className="flex min-h-12 min-w-12 shrink-0 items-center justify-center text-sub active:bg-wash"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<path d="m6 6 12 12M18 6 6 18" />
						</svg>
					</button>
				</header>
				<div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
					{children}
				</div>
			</div>
		</dialog>,
		document.body,
	);
}
