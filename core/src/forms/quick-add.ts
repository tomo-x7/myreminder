// クイック追加の流れ。画面は「状態を表示して、操作を渡す」だけにする。
// 既定は手入力(カードを最初から出す)。1行・告知文・写真は AI で解析して、確認カードに進む → 保存。
// 写真の縮小(prepareImage)と、プレビューの Object URL は画面の層の仕事
import { useEffect, useReducer, useRef, useState } from "react";
import type { ParseImageFile } from "../api/types";
import {
	type DraftPatch,
	draftTitle,
	draftToInput,
	emptyDraft,
	hasProblems,
	type InputMode,
	type ParseMode,
	patchDraft,
	validateDraft,
} from "../domain/draft";
import type { Draft } from "../domain/draft-types";
import { errorText } from "../domain/errors";
import { useCourses } from "../queries/courses";
import { type ParseOutcome, useParse } from "../queries/parse";
import { useStartSuggestions } from "../queries/start-suggestions";
import { useCreateTasks } from "../queries/tasks";

/** 入力欄の文字数の上限(worker の parse の上限に合わせる) */
export const QUICK_ADD_TEXT_MAX: Record<ParseMode, number> = { line: 500, text: 8000 };

// ---------- 共有(Web Share Target / 共有インテント)から開くとき ----------

export type SharedParams = { title?: string | null; text?: string | null; url?: string | null };

/**
 * 共有された title / text / url を1つのテキストにまとめる。
 * Android の Chrome などは URL を text に入れて送ってくるので、すでに含まれているものは足さない。
 */
export function combineShared(params: SharedParams): string {
	const title = (params.title ?? "").trim();
	const text = (params.text ?? "").trim();
	const url = (params.url ?? "").trim();
	const lines: string[] = [];
	if (title && !text.includes(title)) lines.push(title);
	if (text) lines.push(text);
	if (url && !text.includes(url)) lines.push(url);
	return lines.join("\n").slice(0, QUICK_ADD_TEXT_MAX.text);
}

/** 共有された内容 → クイック追加の初期値。テキストがあれば告知文の貼り付けとして、最初から解析を始める(なければ手入力) */
export function sharedToQuickAdd(params: SharedParams): {
	initialText: string;
	initialMode: InputMode;
	autoSubmit: boolean;
} {
	const initialText = combineShared(params);
	return { initialText, initialMode: initialText ? "text" : "manual", autoSubmit: initialText !== "" };
}

// ---------- 状態 ----------

/** 確認画面に出す、解析の結果のうち画面で使うもの */
export type QuickAddOutcome = Pick<ParseOutcome, "notice" | "startSuggestions" | "pasted">;

export type QuickAddState = {
	mode: InputMode;
	/** 1行・告知文の入力。手入力のカードを開いている間も残す */
	text: string;
	/** 手入力のカード。AI の入力に切り替えても、戻ったときに残っている */
	manual: Draft;
	/** null なら入力画面(手入力のカードか、1行・告知文の入力欄)、あれば確認画面 */
	outcome: QuickAddOutcome | null;
	/** 確認画面のカード(解析の結果) */
	drafts: Draft[];
	/** 登録を押したあとに true。未入力の欄にエラーを出す */
	showProblems: boolean;
	saveError: string | null;
};

export type QuickAddAction =
	| { type: "mode"; mode: InputMode }
	| { type: "text"; text: string }
	| { type: "parsed"; result: ParseOutcome }
	| { type: "patch"; key: string; patch: DraftPatch }
	| { type: "remove"; key: string }
	| { type: "invalid" }
	| { type: "saveStart" }
	| { type: "saveFailed"; message: string }
	| { type: "back" }
	| { type: "reset" };

/** 入力画面に戻る。入力した文章は残す */
const toInputScreen = (s: QuickAddState): QuickAddState => ({
	...s,
	outcome: null,
	drafts: [],
	showProblems: false,
	saveError: null,
});

export function quickAddReducer(s: QuickAddState, a: QuickAddAction): QuickAddState {
	switch (a.type) {
		case "mode": {
			const next = { ...s, mode: a.mode, saveError: null };
			// 入力した1行を手入力に持ち込む(カードの題が空のときだけ)
			if (a.mode === "manual" && s.mode !== "manual" && s.manual.title === "" && s.text.trim() !== "") {
				return { ...next, manual: { ...s.manual, title: draftTitle(s.mode, s.text) } };
			}
			return next;
		}
		case "text":
			return { ...s, text: a.text };
		case "parsed":
			return {
				...s,
				drafts: a.result.drafts,
				outcome: {
					notice: a.result.notice,
					startSuggestions: a.result.startSuggestions,
					pasted: a.result.pasted,
				},
				showProblems: false,
				saveError: null,
			};
		case "patch":
			return {
				...s,
				drafts: s.drafts.map((d) => (d.key === a.key ? patchDraft(d, a.patch) : d)),
				manual: s.manual.key === a.key ? patchDraft(s.manual, a.patch) : s.manual,
			};
		case "remove":
			return { ...s, drafts: s.drafts.filter((d) => d.key !== a.key) };
		case "invalid":
			return { ...s, showProblems: true };
		case "saveStart":
			return { ...s, saveError: null };
		case "saveFailed":
			return { ...s, saveError: a.message };
		case "back":
			return toInputScreen(s);
		case "reset":
			// 保存し終えたあと。文章も手入力のカードも消す
			return toInputScreen({ ...s, text: "", manual: emptyDraft() });
	}
}

// ---------- フック ----------

export type QuickAddFlowOptions<Img> = {
	/** 写真の縮小(web は canvas、アプリは expo-image-manipulator など)。送る形で返す */
	prepareImage: (image: Img) => Promise<ParseImageFile>;
	/** 登録し終えたとき(シートを閉じる・ホームへ戻るなど) */
	onDone: () => void;
	/** 入力欄の初期値(共有などから渡す)。省略時は空 */
	initialText?: string;
	/** 最初の入力方法。省略時は手入力 */
	initialMode?: InputMode;
	/** true なら、初期値を入れた状態で最初に一度だけ解析を始める(初期値が空なら何もしない) */
	autoSubmit?: boolean;
	/** 共有された写真。渡されたら、最初に一度だけ写真として解析を始める */
	initialImage?: Img;
};

export type QuickAddScreen = "manual" | "input" | "confirm";

/**
 * クイック追加の状態と操作。
 * - `manual`: 手入力のカード1枚(既定)。登録でそのまま保存
 * - `input`: 1行・告知文の入力欄 → 解析
 * - `confirm`: 解析の結果のカード(編集・削除)→ 保存
 * 保存が途中で失敗したら、保存できた分のカードは消す(やり直しで二重に保存しない)
 */
export function useQuickAddFlow<Img = Blob>(options: QuickAddFlowOptions<Img>) {
	const { prepareImage, onDone, initialText, initialMode, autoSubmit, initialImage } = options;
	const [state, dispatch] = useReducer(
		quickAddReducer,
		undefined,
		(): QuickAddState => ({
			mode: initialMode ?? "manual",
			text: initialText ?? "",
			manual: emptyDraft(),
			outcome: null,
			drafts: [],
			showProblems: false,
			saveError: null,
		}),
	);
	// 写真から追加したとき、その写真(プレビュー用)。入力画面に戻ると消える
	const [image, setImage] = useState<Img | null>(null);
	const courses = useCourses().data ?? [];
	const parse = useParse(prepareImage, { onSuccess: (result) => dispatch({ type: "parsed", result }) });
	const save = useCreateTasks();

	const { mode, text, outcome } = state;
	const screen: QuickAddScreen = outcome !== null ? "confirm" : mode === "manual" ? "manual" : "input";
	// 手入力のカードか、確認画面のカード。保存と検証の対象
	const drafts = screen === "manual" ? [state.manual] : state.drafts;
	const problems = drafts.map(validateDraft);

	// 「いつ始める?」の候補。解析の結果に入っていればそれを使い、手入力のカード(と、候補のない解析の結果)はここで取る
	const needsOwnStarts = screen === "manual" || (outcome !== null && outcome.startSuggestions.length === 0);
	const ownStarts = useStartSuggestions(needsOwnStarts);
	const startSuggestions =
		outcome && outcome.startSuggestions.length > 0
			? outcome.startSuggestions
			: (ownStarts.data?.startSuggestions ?? []);

	function submit() {
		const trimmed = text.trim();
		if (mode === "manual" || !trimmed || parse.isPending) return;
		parse.mutate({ mode, text: trimmed });
	}

	function submitImage(picked: Img) {
		if (parse.isPending) return;
		setImage(picked);
		parse.mutate({ image: picked });
	}

	/** 入力画面に戻る。入力した文章と手入力のカードは残す */
	function goBack() {
		setImage(null);
		dispatch({ type: "back" });
	}

	// 共有からの起動では、確認カードを最初から出す。StrictMode の二重実行でも解析は一度だけ
	const autoSubmitted = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: 初回マウント時だけ実行する
	useEffect(() => {
		if (autoSubmitted.current) return;
		if (initialImage !== undefined) {
			autoSubmitted.current = true;
			submitImage(initialImage);
		} else if (autoSubmit) {
			autoSubmitted.current = true;
			submit();
		}
	}, []);

	async function confirm() {
		if (problems.some(hasProblems)) {
			dispatch({ type: "invalid" });
			return;
		}
		dispatch({ type: "saveStart" });
		let saved = 0;
		const keys = drafts.map((d) => d.key);
		try {
			await save.mutateAsync({
				inputs: drafts.map((d) => draftToInput(d, courses)),
				onSaved: (i) => {
					saved += 1;
					const key = keys[i];
					if (key !== undefined) dispatch({ type: "remove", key });
				},
			});
			onDone();
			setImage(null);
			dispatch({ type: "reset" });
		} catch (e) {
			const msg = errorText(e);
			dispatch({ type: "saveFailed", message: saved > 0 ? `${msg}(${saved}件保存済み)` : msg });
		}
	}

	return {
		/** どの画面か。手入力のカード / 1行・告知文の入力欄 / 解析結果の確認 */
		screen,
		// 入力
		mode,
		setMode: (m: InputMode) => dispatch({ type: "mode", mode: m }),
		text,
		setText: (t: string) => dispatch({ type: "text", text: t }),
		/** 1行・告知文の文字数の上限(手入力のときは 1 行のもの) */
		textMax: QUICK_ADD_TEXT_MAX[mode === "manual" ? "line" : mode],
		/** 解析中 */
		parsing: parse.isPending,
		canSubmit: mode !== "manual" && text.trim() !== "" && !parse.isPending,
		image,
		submit,
		submitImage,
		// カード(手入力のカードは1枚、確認画面は解析の結果)。outcome が null の間は確認画面ではない
		outcome,
		drafts,
		/** カードに出す「いつ始める?」の候補 */
		startSuggestions,
		problems,
		showProblems: state.showProblems,
		courses,
		saving: save.isPending,
		saveError: state.saveError,
		patchDraft: (key: string, patch: DraftPatch) => dispatch({ type: "patch", key, patch }),
		removeDraft: (key: string) => dispatch({ type: "remove", key }),
		back: goBack,
		confirm,
	};
}
