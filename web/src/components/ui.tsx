// 共通の部品とクラス。色・角丸・影は theme.css のトークンだけを使う(#29)
// 方針: 余白は詰める、面ではなく罫線で区切る、塗るのは主要な操作だけ
import type { ReactNode } from "react";

export const inputClass =
	"w-full rounded-sm border border-line bg-paper px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none disabled:bg-wash disabled:text-faint";

const btn =
	"inline-flex items-center justify-center gap-1 rounded-sm border px-3 py-1.5 text-sm font-medium disabled:opacity-40";
export const btnPrimary = `${btn} border-ink bg-ink text-paper active:bg-sub`;
export const btnSecondary = `${btn} border-line bg-paper text-ink active:bg-wash`;
/** 取り消せない操作。塗らずに文字だけ赤くする */
export const btnDanger = `${btn} border-line bg-paper text-danger active:bg-wash`;
export const btnGhost = "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-sm text-sub active:bg-wash";
/** 文中のリンク */
export const linkClass = "text-ink underline decoration-faint underline-offset-2";

/** 選択肢のチップ(絞り込み・30/60/90分など)。選ばれたものだけ墨で塗る */
export function chipClass(selected: boolean): string {
	return `shrink-0 rounded-sm border px-2 py-1 text-xs ${
		selected ? "border-ink bg-ink text-paper" : "border-line bg-paper text-sub active:bg-wash"
	}`;
}

/** 罫線で区切ったリスト。SectionTitle の下にそのまま置く */
export const listClass = "flex flex-col divide-y divide-line border-b border-line";

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
		<label className="flex flex-col gap-1 text-xs text-sub">
			{label}
			{children}
			{hint && <span className="text-xs text-faint">{hint}</span>}
			{error && <span className="text-xs text-danger">{error}</span>}
		</label>
	);
}

type Tone = "plain" | "warn" | "danger";

const NOTICE_TONE: Record<Tone, string> = {
	plain: "border-line text-sub",
	warn: "border-warn text-warn",
	danger: "border-danger text-danger",
};

/** 補足・注意の1行。面は塗らず、左の線と文字色で示す */
export function Notice({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
	return <div className={`border-l-2 py-0.5 pl-2 text-xs ${NOTICE_TONE[tone]}`}>{children}</div>;
}

export function ErrorNotice({ children }: { children: ReactNode }) {
	return (
		<p role="alert" className="border-l-2 border-danger py-0.5 pl-2 text-sm text-danger">
			{children}
		</p>
	);
}

/** 小さな札(授業・バイト・状態など) */
export function Tag({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
	const color =
		tone === "plain"
			? "border-line text-sub"
			: tone === "warn"
				? "border-warn text-warn"
				: "border-danger text-danger";
	return (
		<span className={`inline-block shrink-0 rounded-sm border px-1 text-[11px] leading-4 font-medium ${color}`}>
			{children}
		</span>
	);
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
	return (
		<header className="flex min-h-9 items-center justify-between gap-2">
			<h1 className="text-base font-bold">{title}</h1>
			{action}
		</header>
	);
}

/** 区切りの見出し。下の罫線がそのままリストの上端になる */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return (
		<div className="flex min-h-7 items-end justify-between gap-2 border-b border-line pb-1">
			<h2 className="text-xs font-semibold text-sub">{children}</h2>
			{action}
		</div>
	);
}

export function Empty({ children }: { children: ReactNode }) {
	return <p className="py-6 text-center text-xs text-faint">{children}</p>;
}

/** useQuery の結果の、読み込み中/エラーの表示。成功したら children にデータを渡す */
export function QueryState<T>({
	query,
	children,
}: {
	query: { data: T | undefined; isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown };
	children: (data: T) => ReactNode;
}) {
	if (query.isPending) return <p className="py-6 text-center text-xs text-faint">読み込み中…</p>;
	if (query.isError || query.data === undefined) {
		return (
			<div className="flex flex-col items-start gap-2 py-3">
				<ErrorNotice>読み込めませんでした: {query.error?.message ?? "不明なエラー"}</ErrorNotice>
				<button type="button" className={btnSecondary} onClick={() => query.refetch()}>
					再読み込み
				</button>
			</div>
		);
	}
	return children(query.data);
}
