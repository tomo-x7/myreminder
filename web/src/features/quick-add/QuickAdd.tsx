import type { StartSuggestion } from "core/api/types";
import {
	candidateToDraft,
	draftTitle,
	draftToInput,
	emptyDraft,
	hasProblems,
	type ParseMode,
	validateDraft,
} from "core/domain/draft";
import type { Draft } from "core/domain/draft-types";
import { errorText } from "core/domain/errors";
import { useNow } from "core/hooks/use-now";
import { useCourses } from "core/queries/courses";
import { useParse } from "core/queries/parse";
import { useCreateTasks } from "core/queries/tasks";
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

const LINE_MAX = 500;
const TEXT_MAX = 8000;

export function QuickAdd({ onDone, onCancel, initialText, initialMode, autoSubmit, initialImage }: Props) {
	const now = useNow();
	const [mode, setMode] = useState<ParseMode>(initialMode ?? "line");
	const [text, setText] = useState(initialText ?? "");
	const [outcome, setOutcome] = useState<{
		notice: string | null;
		startSuggestions: StartSuggestion[];
		pasted: string | null;
	} | null>(null);
	const [drafts, setDrafts] = useState<Draft[]>([]);
	const [showProblems, setShowProblems] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	// 写真から追加したときのプレビュー(Object URL)
	const [preview, setPreview] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!preview) return;
		return () => URL.revokeObjectURL(preview);
	}, [preview]);

	const coursesQuery = useCourses();
	const courses = coursesQuery.data ?? [];

	const parse = useParse(prepareParseImage, {
		onSuccess: (r) => {
			setDrafts(r.drafts);
			setOutcome({ notice: r.notice, startSuggestions: r.startSuggestions, pasted: r.pasted });
			setShowProblems(false);
			setSaveError(null);
		},
	});

	const patchDraft = (key: string, patch: Partial<Draft>) =>
		setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
	const removeDraft = (key: string) => setDrafts((ds) => ds.filter((d) => d.key !== key));

	// 途中で失敗したとき、保存できた分は画面から消す(やり直しで二重に保存しない)
	const savedCount = useRef(0);
	const save = useCreateTasks();

	/** 入力画面に戻る。入力した文章は残す */
	function back() {
		setPreview(null);
		setOutcome(null);
		setDrafts([]);
		setShowProblems(false);
		setSaveError(null);
	}

	/** 保存し終えたあと。文章も消す */
	function reset() {
		setText("");
		back();
	}

	function startManual() {
		setDrafts([emptyDraft(draftTitle(mode, text))]);
		setOutcome({ notice: null, startSuggestions: [], pasted: mode === "text" && text.trim() ? text : null });
	}

	function submit() {
		const trimmed = text.trim();
		if (!trimmed || parse.isPending) return;
		parse.mutate({ mode, text: trimmed });
	}

	function submitImage(image: Blob) {
		if (parse.isPending) return;
		setPreview(URL.createObjectURL(image));
		parse.mutate({ image });
	}

	// 共有からの起動では、確認カードを最初から出す。StrictMode の二重実行でも解析は一度だけ
	const autoSubmitted = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: 初回マウント時だけ実行する
	useEffect(() => {
		if (autoSubmitted.current) return;
		if (initialImage) {
			autoSubmitted.current = true;
			submitImage(initialImage);
		} else if (autoSubmit) {
			autoSubmitted.current = true;
			submit();
		}
	}, []);

	async function confirm() {
		const problems = drafts.map(validateDraft);
		if (problems.some(hasProblems)) {
			setShowProblems(true);
			return;
		}
		setSaveError(null);
		savedCount.current = 0;
		const keys = drafts.map((d) => d.key);
		try {
			await save.mutateAsync({
				inputs: drafts.map((d) => draftToInput(d, courses)),
				onSaved: (i) => {
					savedCount.current += 1;
					const key = keys[i];
					if (key !== undefined) removeDraft(key);
				},
			});
			onDone();
			reset();
		} catch (e) {
			const msg = errorText(e);
			setSaveError(savedCount.current > 0 ? `${msg}(${savedCount.current}件は保存済み)` : msg);
		}
	}

	// 写真を読み取っている間
	if (outcome === null && parse.isPending && preview) {
		return (
			<div className="flex flex-col items-center gap-2 py-2" aria-live="polite">
				<img src={preview} alt="選んだ写真" className="max-h-64 rounded-sm border border-line object-contain" />
				<p className="text-xs text-sub">写真から課題を読み取っています…(数秒かかります)</p>
			</div>
		);
	}

	// 入力画面
	if (outcome === null) {
		const max = mode === "line" ? LINE_MAX : TEXT_MAX;
		return (
			<form
				className="flex flex-col gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					submit();
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
							onClick={() => setMode(m)}
							className={chipClass(mode === m)}
						>
							{label}
						</button>
					))}
				</div>

				{mode === "line" ? (
					<input
						type="text"
						value={text}
						maxLength={max}
						disabled={parse.isPending}
						onChange={(e) => setText(e.target.value)}
						placeholder="例: 情報倫理 来週月曜の授業前までにレポート2000字"
						aria-label="課題を1行で入力"
						className={inputClass}
					/>
				) : (
					<textarea
						value={text}
						maxLength={max}
						rows={8}
						disabled={parse.isPending}
						onChange={(e) => setText(e.target.value)}
						placeholder="ポータルのお知らせやメールの本文を貼り付けてください。課題を複数まとめて取り出します"
						aria-label="告知文を貼り付け"
						className={inputClass}
					/>
				)}

				<div className="flex flex-wrap items-center gap-1.5">
					<button type="submit" disabled={!text.trim() || parse.isPending} className={btnPrimary}>
						{parse.isPending ? "解析中…" : "解析する"}
					</button>
					<button
						type="button"
						onClick={() => fileInput.current?.click()}
						disabled={parse.isPending}
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
							if (file) submitImage(file);
						}}
					/>
					<button type="button" onClick={startManual} disabled={parse.isPending} className={btnSecondary}>
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
	const problems = drafts.map(validateDraft);
	const saving = save.isPending;
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
					problems={problems[i] ?? {}}
					showProblems={showProblems}
					courses={courses}
					startSuggestions={outcome.startSuggestions}
					now={now}
					disabled={saving}
					onChange={(patch) => patchDraft(d.key, patch)}
					onRemove={drafts.length > 1 ? () => removeDraft(d.key) : undefined}
				/>
			))}

			{saveError && <ErrorNotice>保存できませんでした: {saveError}</ErrorNotice>}

			<div className="sticky bottom-0 flex gap-2 border-t border-line bg-paper py-2">
				<button type="button" onClick={back} disabled={saving} className={btnSecondary}>
					戻る
				</button>
				<button
					type="button"
					onClick={confirm}
					disabled={saving || drafts.length === 0}
					className={`${btnPrimary} flex-1`}
				>
					{saving ? "保存中…" : drafts.length > 1 ? `${drafts.length}件を登録` : "登録する"}
				</button>
			</div>
		</div>
	);
}
