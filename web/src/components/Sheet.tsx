import { type ReactNode, useEffect } from "react";

/** 下から出るシート。背景のタップか Esc で閉じる */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = prev;
		};
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
			<button type="button" aria-label="閉じる" className="flex-1 cursor-default" onClick={onClose} />
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="mx-auto flex max-h-[92svh] w-full max-w-xl flex-col rounded-t-2xl bg-white shadow-xl"
			>
				<div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
					<h2 className="text-lg font-bold text-gray-900">{title}</h2>
					<button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-gray-600">
						閉じる
					</button>
				</div>
				<div className="overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
			</div>
		</div>
	);
}
