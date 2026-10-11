import { useQuickAddFlow } from "core/forms/quick-add";
import { useNow } from "core/hooks/use-now";
import { useEffect, useRef, useState } from "react";
import { btnGhost, btnPrimary, btnSecondary, chipClass, ErrorNotice, inputClass, Notice } from "../../components/ui";
import { CandidateCard } from "./CandidateCard";
import { prepareParseImage } from "./image";

type Props = {
	/** 登録し終えたとき(シートを閉じる・ホームへ戻るなど) */
	onDone: () => void;
	/** 閉じるボタン。省略するとボタンを出さない */
	onCancel?: () => void;
	/** 入力欄の初期値(Web Share Target などから渡す)。省略時は空 */
	initialText?: string;
	/** 最初の入力方法。省略時は 1 行入力 */
	initialMode?: "line" | "text";
	/** true なら、初期値を入れた状態で最初に一度だけ解析を始める(initialText が空なら何もしない) */
	autoSubmit?: boolean;
	/** 共有メニューから届いた画像。渡されたら、最初に一度だけ写真として解析を始める */
	initialImage?: Blob;
};

/** 写真のプレビュー用の Object URL。写真が変わる・なくなる・画面を閉じるときに解放する */
function useObjectUrl(blob: Blob | null): string | null {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		if (!blob) {
			setUrl(null);
			return;
		}
		const created = URL.createObjectURL(blob);
		setUrl(created);
		return () => URL.revokeObjectURL(created);
	}, [blob]);
	return url;
}

export function QuickAdd({ onDone, onCancel, initialText, initialMode, autoSubmit, initialImage }: Props) {
	const now = useNow();
	const flow = useQuickAddFlow({
		prepareImage: prepareParseImage,
		onDone,
		initialText,
		initialMode,
		autoSubmit,
		initialImage,
	});
	const { outcome, drafts, mode } = flow;
	const preview = useObjectUrl(flow.image);
	const fileInput = useRef<HTMLInputElement>(null);

	// 写真を読み取っている間
	if (outcome === null && flow.parsing && flow.image !== null) {
		return (
			<div className="flex flex-col items-center gap-2 py-2" aria-live="polite">
				{preview && (
					<img
						src={preview}
						alt="選んだ写真"
						className="max-h-64 rounded-sm border border-line object-contain"
					/>
				)}
				<p className="text-xs text-sub">写真から課題を読み取っています…(数秒かかります)</p>
			</div>
		);
	}

	// 入力画面
	if (outcome === null) {
		return (
			<form
				className="flex flex-col gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					flow.submit();
				}}
			>
				<div className="flex gap-1.5" role="tablist" aria-label="入力方法">
					{(
						[
							["line", "1行で入力"],
							["text", "告知文を貼り付け"],
						] as const
					).map(([m, label]) => (
						<button
							key={m}
							type="button"
							role="tab"
							aria-selected={mode === m}
							onClick={() => flow.setMode(m)}
							className={chipClass(mode === m)}
						>
							{label}
						</button>
					))}
				</div>

				{mode === "line" ? (
					<input
						type="text"
						value={flow.text}
						maxLength={flow.textMax}
						disabled={flow.parsing}
						onChange={(e) => flow.setText(e.target.value)}
						placeholder="例: 情報倫理 来週月曜の授業前までにレポート2000字"
						aria-label="課題を1行で入力"
						className={inputClass}
					/>
				) : (
					<textarea
						value={flow.text}
						maxLength={flow.textMax}
						rows={8}
						disabled={flow.parsing}
						onChange={(e) => flow.setText(e.target.value)}
						placeholder="ポータルのお知らせやメールの本文を貼り付けてください。課題を複数まとめて取り出します"
						aria-label="告知文を貼り付け"
						className={inputClass}
					/>
				)}

				<div className="flex flex-wrap items-center gap-1.5">
					<button type="submit" disabled={!flow.canSubmit} className={btnPrimary}>
						{flow.parsing ? "解析中…" : "解析する"}
					</button>
					<button
						type="button"
						onClick={() => fileInput.current?.click()}
						disabled={flow.parsing}
						className={btnSecondary}
					>
						写真から
					</button>
					<input
						ref={fileInput}
						type="file"
						accept="image/*"
						capture="environment"
						hidden
						aria-label="写真を選ぶ"
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (file) flow.submitImage(file);
						}}
					/>
					<button type="button" onClick={flow.startManual} disabled={flow.parsing} className={btnSecondary}>
						手入力で登録
					</button>
					{onCancel && (
						<button type="button" onClick={onCancel} className={`${btnGhost} ml-auto`}>
							閉じる
						</button>
					)}
				</div>
			</form>
		);
	}

	// 確認画面
	const saving = flow.saving;
	return (
		<div className="flex flex-col gap-2">
			{outcome.notice && (
				<div role="alert">
					<Notice tone="warn">{outcome.notice}</Notice>
				</div>
			)}
			{outcome.pasted && (
				<details open className="text-xs text-sub">
					<summary className="cursor-pointer">貼り付けた本文</summary>
					<p className="mt-1 max-h-40 overflow-y-auto border-l-2 border-line pl-2 break-words whitespace-pre-wrap">
						{outcome.pasted}
					</p>
				</details>
			)}
			{preview && (
				<img
					src={preview}
					alt="読み取った写真"
					className="max-h-40 self-start rounded-sm border border-line object-contain"
				/>
			)}
			{drafts.length > 1 && (
				<p className="text-xs text-sub">{drafts.length}件の課題を見つけました。内容を確認してください</p>
			)}

			{drafts.map((d, i) => (
				<CandidateCard
					key={d.key}
					draft={d}
					problems={flow.problems[i] ?? {}}
					showProblems={flow.showProblems}
					courses={flow.courses}
					startSuggestions={outcome.startSuggestions}
					now={now}
					disabled={saving}
					onChange={(patch) => flow.patchDraft(d.key, patch)}
					onRemove={drafts.length > 1 ? () => flow.removeDraft(d.key) : undefined}
				/>
			))}

			{flow.saveError && <ErrorNotice>保存できませんでした: {flow.saveError}</ErrorNotice>}

			<div className="sticky bottom-0 flex gap-2 border-t border-line bg-paper py-2">
				<button type="button" onClick={flow.back} disabled={saving} className={btnSecondary}>
					戻る
				</button>
				<button
					type="button"
					onClick={flow.confirm}
					disabled={saving || drafts.length === 0}
					className={`${btnPrimary} flex-1`}
				>
					{saving ? "保存中…" : drafts.length > 1 ? `${drafts.length}件を登録` : "登録する"}
				</button>
			</div>
		</div>
	);
}
