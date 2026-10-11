import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { btnGhost, btnPrimary, btnSecondary, chipClass, ErrorNotice, inputClass, Notice } from "../../components/ui";
import { api } from "../../lib/api";
import { CandidateCard } from "./CandidateCard";
import { candidateToDraft, draftToInput, emptyDraft, hasProblems, TITLE_MAX, validateDraft } from "./draft";
import { resizeImage } from "./image";
import type { Draft, StartSuggestion, TaskCreateInput } from "./types";

type Props = {
	/**
	 * 確認済みのタスクを保存する。reject すると画面にエラーを出してカードを残す。
	 * i 番目を保存できるたびに onSaved(i) を呼ぶこと(保存済みのカードを消し、やり直しで二重に保存しないため)
	 */
	onConfirm: (inputs: TaskCreateInput[], onSaved: (index: number) => void) => Promise<void>;
	/** 登録後・閉じるときに入力に戻したいとき用(任意) */
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

type Mode = "line" | "text";

type ParseOutcome = {
	drafts: Draft[];
	startSuggestions: StartSuggestion[];
	now: number;
	/** 解析に失敗/空だったときの案内。drafts は手入力用の空カード */
	notice: string | null;
	/** 解析に失敗した告知文の本文。手入力のときに見比べられるよう確認画面に残す */
	pasted: string | null;
};

const LINE_MAX = 500;
const TEXT_MAX = 8000;

/** 手入力カードの題。1行ならその行、告知文なら最初の空でない行(本文は確認画面に残す) */
function draftTitle(mode: Mode, text: string): string {
	const line = mode === "line" ? text : (text.split("\n").find((l) => l.trim()) ?? "");
	return line.trim().slice(0, TITLE_MAX);
}

function useNow(intervalMs = 30_000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}

/** 解析 API を呼ぶ。失敗しても例外にせず、手入力のカードを返す */
async function parseInput(mode: Mode, text: string): Promise<ParseOutcome> {
	const fallback = (notice: string): ParseOutcome => ({
		drafts: [emptyDraft(draftTitle(mode, text))],
		startSuggestions: [],
		now: Date.now(),
		notice,
		pasted: mode === "text" ? text : null,
	});
	try {
		const res =
			mode === "line"
				? await api.api.parse.line.$post({ json: { text } })
				: await api.api.parse.text.$post({ json: { text } });
		if (!res.ok) return fallback("解析できませんでした。手入力してください");
		const data = await res.json();
		if (data.candidates.length === 0) {
			const out = fallback(data.error ?? "解析できませんでした。手入力してください");
			return { ...out, startSuggestions: data.startSuggestions, now: data.now };
		}
		return {
			drafts: data.candidates.map(candidateToDraft),
			startSuggestions: data.startSuggestions,
			now: data.now,
			notice: null,
			pasted: null,
		};
	} catch {
		return fallback("通信に失敗しました。手入力してください");
	}
}

const PHOTO_NOTICE = "写真から読み取りました。文字の読み違いがないか確認してください";

/** 写真の解析 API を呼ぶ(縮小してから送る)。失敗しても例外にせず、手入力のカードを返す */
async function parseImageInput(image: Blob): Promise<ParseOutcome> {
	const fallback = (notice: string): ParseOutcome => ({
		drafts: [emptyDraft("")],
		startSuggestions: [],
		now: Date.now(),
		notice,
		pasted: null,
	});
	try {
		const jpeg = await resizeImage(image);
		const file = new File([jpeg], "slide.jpg", { type: "image/jpeg" });
		const res = await api.api.parse.image.$post({ form: { image: file } });
		if (res.status === 413) return fallback("画像が大きすぎます。手入力してください");
		if (!res.ok) return fallback("解析できませんでした。手入力してください");
		const data = await res.json();
		if (data.candidates.length === 0) {
			const out = fallback(data.error ?? "解析できませんでした。手入力してください");
			return { ...out, startSuggestions: data.startSuggestions, now: data.now };
		}
		return {
			drafts: data.candidates.map(candidateToDraft),
			startSuggestions: data.startSuggestions,
			now: data.now,
			notice: PHOTO_NOTICE,
			pasted: null,
		};
	} catch {
		return fallback("写真を読み込めませんでした。手入力してください");
	}
}

export function QuickAdd({ onConfirm, onCancel, initialText, initialMode, autoSubmit, initialImage }: Props) {
	const now = useNow();
	const [mode, setMode] = useState<Mode>(initialMode ?? "line");
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

	const coursesQuery = useQuery({
		queryKey: ["courses"],
		queryFn: async () => {
			const res = await api.api.courses.$get();
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return res.json();
		},
	});
	const courses = coursesQuery.data ?? [];

	const parse = useMutation({
		mutationFn: (input: { mode: Mode; text: string } | { image: Blob }) =>
			"image" in input ? parseImageInput(input.image) : parseInput(input.mode, input.text),
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
	const save = useMutation({
		mutationFn: ({ keys, inputs }: { keys: string[]; inputs: TaskCreateInput[] }) =>
			onConfirm(inputs, (i) => {
				savedCount.current += 1;
				const key = keys[i];
				if (key !== undefined) removeDraft(key);
			}),
		onSuccess: () => reset(),
		onError: (e) => {
			const msg = e instanceof Error ? e.message : "保存に失敗しました";
			setSaveError(savedCount.current > 0 ? `${msg}(${savedCount.current}件は保存済み)` : msg);
		},
	});

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

	function confirm() {
		const problems = drafts.map(validateDraft);
		if (problems.some(hasProblems)) {
			setShowProblems(true);
			return;
		}
		setSaveError(null);
		savedCount.current = 0;
		save.mutate({ keys: drafts.map((d) => d.key), inputs: drafts.map((d) => draftToInput(d, courses)) });
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
