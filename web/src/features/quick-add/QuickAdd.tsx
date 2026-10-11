import type { InputMode } from "core/domain/draft";
import { useQuickAddFlow } from "core/forms/quick-add";
import { useNow } from "core/hooks/use-now";
import { useEffect, useRef, useState } from "react";
import { btnGhost, btnPrimary, btnSecondary, chipClass, ErrorNotice, inputClass, Notice } from "../../components/ui";
import { CandidateCard } from "./CandidateCard";
import { prepareParseImage } from "./image";

type Props = {
	/** 登録し終えたとき(シートを閉じる・ホームへ戻るなど) */
	onDone: () => void;
	/** やめるボタン。省略するとボタンを出さない(シートは自分の閉じるを持つ) */
	onCancel?: () => void;
	/** 入力欄の初期値(Web Share Target などから渡す)。省略時は空 */
	initialText?: string;
	/** 最初の入力方法。省略時は手入力 */
	initialMode?: InputMode;
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

const MODES: readonly (readonly [InputMode, string])[] = [
	["manual", "手入力"],
	["line", "1行"],
	["text", "貼り付け"],
];

type Flow = ReturnType<typeof useQuickAddFlow<Blob>>;

/** 入力方法のチップ。写真は選んだ時点で解析に進むので、タブではなくボタン */
function ModeChips({ flow }: { flow: Flow }) {
	const fileInput = useRef<HTMLInputElement>(null);
	return (
		<div className="flex gap-1.5">
			<div role="tablist" aria-label="入力方法" className="flex gap-1.5">
				{MODES.map(([m, label]) => (
					<button
						key={m}
						type="button"
						role="tab"
						aria-selected={flow.mode === m}
						disabled={flow.parsing}
						onClick={() => flow.setMode(m)}
						className={chipClass(flow.mode === m)}
					>
						{label}
					</button>
				))}
			</div>
			<button
				type="button"
				disabled={flow.parsing}
				onClick={() => fileInput.current?.click()}
				className={chipClass(false)}
			>
				写真
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
		</div>
	);
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
	const { screen, outcome, drafts } = flow;
	const preview = useObjectUrl(flow.image);

	// 写真を読み取っている間
	if (outcome === null && flow.parsing && flow.image !== null) {
		return (
			<div className="flex flex-col items-center gap-2 py-2" aria-live="polite">
				{preview && (
					<img src={preview} alt="写真" className="max-h-64 rounded-sm border border-line object-contain" />
				)}
				<p className="text-xs text-sub">読み取り中…</p>
			</div>
		);
	}

	// 1行・告知文の入力欄
	if (screen === "input") {
		return (
			<form
				className="flex flex-col gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					flow.submit();
				}}
			>
				<ModeChips flow={flow} />

				{flow.mode === "line" ? (
					<input
						type="text"
						value={flow.text}
						maxLength={flow.textMax}
						disabled={flow.parsing}
						onChange={(e) => flow.setText(e.target.value)}
						placeholder="情報倫理 来週月曜の授業前までにレポート2000字"
						aria-label="1行"
						className={inputClass}
					/>
				) : (
					<textarea
						value={flow.text}
						maxLength={flow.textMax}
						rows={8}
						disabled={flow.parsing}
						onChange={(e) => flow.setText(e.target.value)}
						placeholder="告知文"
						aria-label="告知文"
						className={inputClass}
					/>
				)}

				<div className="flex flex-wrap items-center gap-1.5">
					<button type="submit" disabled={!flow.canSubmit} className={btnPrimary}>
						{flow.parsing ? "解析中…" : "解析"}
					</button>
					{onCancel && (
						<button type="button" onClick={onCancel} className={`${btnGhost} ml-auto`}>
							やめる
						</button>
					)}
				</div>
			</form>
		);
	}

	// 手入力のカード(screen === "manual")と、解析の結果の確認(screen === "confirm")
	const manual = screen === "manual";
	const saving = flow.saving;
	return (
		<div className="flex flex-col gap-2">
			{manual && <ModeChips flow={flow} />}
			{outcome?.notice && (
				<div role="alert">
					<Notice tone="warn">{outcome.notice}</Notice>
				</div>
			)}
			{outcome?.pasted && (
				<details open className="text-xs text-sub">
					<summary className="cursor-pointer">本文</summary>
					<p className="mt-1 max-h-40 overflow-y-auto border-l-2 border-line pl-2 break-words whitespace-pre-wrap">
						{outcome.pasted}
					</p>
				</details>
			)}
			{preview && (
				<img
					src={preview}
					alt="写真"
					className="max-h-40 self-start rounded-sm border border-line object-contain"
				/>
			)}

			{drafts.map((d, i) => (
				<CandidateCard
					key={d.key}
					draft={d}
					titleFirst={manual}
					problems={flow.problems[i] ?? {}}
					showProblems={flow.showProblems}
					courses={flow.courses}
					startSuggestions={flow.startSuggestions}
					now={now}
					disabled={saving}
					onChange={(patch) => flow.patchDraft(d.key, patch)}
					onRemove={!manual && drafts.length > 1 ? () => flow.removeDraft(d.key) : undefined}
				/>
			))}

			{flow.saveError && <ErrorNotice>保存失敗: {flow.saveError}</ErrorNotice>}

			<div className="sticky bottom-0 flex gap-2 border-t border-line bg-paper py-2">
				{manual ? (
					onCancel && (
						<button type="button" onClick={onCancel} disabled={saving} className={btnSecondary}>
							やめる
						</button>
					)
				) : (
					<button type="button" onClick={flow.back} disabled={saving} className={btnSecondary}>
						戻る
					</button>
				)}
				<button
					type="button"
					onClick={flow.confirm}
					disabled={saving || drafts.length === 0}
					className={`${btnPrimary} flex-1`}
				>
					{saving ? "保存中…" : drafts.length > 1 ? `${drafts.length}件を登録` : "登録"}
				</button>
			</div>
		</div>
	);
}
