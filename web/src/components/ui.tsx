import type { ReactNode } from "react";

export const inputClass =
	"w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-base font-normal text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100";

const btn = "rounded-md px-4 py-3 text-base font-semibold disabled:opacity-50";
export const btnPrimary = `${btn} bg-blue-600 text-white active:bg-blue-700`;
export const btnSecondary = `${btn} border border-gray-300 bg-white text-gray-800 active:bg-gray-100`;
export const btnDanger = `${btn} bg-red-600 text-white active:bg-red-700`;
export const btnGhost = "rounded-md px-3 py-2 text-sm font-medium text-gray-700 active:bg-gray-100";

/** ラベル付きの入力欄。label で包むので、中の input/select とひも付く */
export function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: ReactNode;
	error?: string;
	children: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: children に input/select を渡して包む
		<label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
			{label}
			{children}
			{hint && <span className="text-xs font-normal text-gray-500">{hint}</span>}
			{error && <span className="text-xs font-normal text-red-600">{error}</span>}
		</label>
	);
}

export function ErrorNotice({ children }: { children: ReactNode }) {
	return (
		<p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">
			{children}
		</p>
	);
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
	return (
		<header className="flex items-center justify-between gap-2">
			<h1 className="text-2xl font-bold text-gray-900">{title}</h1>
			{action}
		</header>
	);
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<h2 className="text-lg font-bold text-gray-900">{children}</h2>
			{action}
		</div>
	);
}

/** useQuery の結果の、読み込み中/エラーの表示。成功したら children にデータを渡す */
export function QueryState<T>({
	query,
	children,
}: {
	query: { data: T | undefined; isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown };
	children: (data: T) => ReactNode;
}) {
	if (query.isPending) return <p className="py-8 text-center text-sm text-gray-500">読み込み中…</p>;
	if (query.isError || query.data === undefined) {
		return (
			<div className="flex flex-col items-start gap-2 py-4">
				<ErrorNotice>読み込めませんでした: {query.error?.message ?? "不明なエラー"}</ErrorNotice>
				<button type="button" className={btnSecondary} onClick={() => query.refetch()}>
					再読み込み
				</button>
			</div>
		);
	}
	return children(query.data);
}
