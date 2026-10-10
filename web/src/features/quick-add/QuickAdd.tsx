import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { CandidateCard } from "./CandidateCard";
import { candidateToDraft, draftToInput, emptyDraft, hasProblems, validateDraft } from "./draft";
import type { Draft, StartSuggestion, TaskCreateInput } from "./types";

type Props = {
	/** 確認済みのタスクを保存する。reject すると画面にエラーを出してカードを残す */
	onConfirm: (inputs: TaskCreateInput[]) => Promise<void>;
	/** 登録後・閉じるときに入力に戻したいとき用(任意) */
	onCancel?: () => void;
};

type Mode = "line" | "text";

type ParseOutcome = {
	drafts: Draft[];
	startSuggestions: StartSuggestion[];
	now: number;
	/** 解析に失敗/空だったときの案内。drafts は手入力用の空カード */
	notice: string | null;
};

const LINE_MAX = 500;
const TEXT_MAX = 8000;

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
		drafts: [emptyDraft(mode === "line" ? text : "")],
		startSuggestions: [],
		now: Date.now(),
		notice,
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
		};
	} catch {
		return fallback("通信に失敗しました。手入力してください");
	}
}

export function QuickAdd({ onConfirm, onCancel }: Props) {
	const now = useNow();
	const [mode, setMode] = useState<Mode>("line");
	const [text, setText] = useState("");
	const [outcome, setOutcome] = useState<{ notice: string | null; startSuggestions: StartSuggestion[] } | null>(null);
	const [drafts, setDrafts] = useState<Draft[]>([]);
	const [showProblems, setShowProblems] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

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
		mutationFn: ({ mode, text }: { mode: Mode; text: string }) => parseInput(mode, text),
		onSuccess: (r) => {
			setDrafts(r.drafts);
			setOutcome({ notice: r.notice, startSuggestions: r.startSuggestions });
			setShowProblems(false);
			setSaveError(null);
		},
	});

	const save = useMutation({
		mutationFn: (inputs: TaskCreateInput[]) => onConfirm(inputs),
		onSuccess: () => reset(),
		onError: (e) => setSaveError(e instanceof Error ? e.message : "保存に失敗しました"),
	});

	function reset() {
		setText("");
		setOutcome(null);
		setDrafts([]);
		setShowProblems(false);
		setSaveError(null);
	}

	function startManual() {
		setDrafts([emptyDraft(mode === "line" ? text.trim() : "")]);
		setOutcome({ notice: null, startSuggestions: [] });
	}

	function submit() {
		const trimmed = text.trim();
		if (!trimmed || parse.isPending) return;
		parse.mutate({ mode, text: trimmed });
	}

	function confirm() {
		const problems = drafts.map(validateDraft);
		if (problems.some(hasProblems)) {
			setShowProblems(true);
			return;
		}
		setSaveError(null);
		save.mutate(drafts.map((d) => draftToInput(d, courses)));
	}

	const patchDraft = (key: string, patch: Partial<Draft>) =>
		setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
	const removeDraft = (key: string) => setDrafts((ds) => ds.filter((d) => d.key !== key));

	// 入力画面
	if (outcome === null) {
		const max = mode === "line" ? LINE_MAX : TEXT_MAX;
		return (
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<div className="flex gap-2" role="tablist" aria-label="入力方法">
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
							className={`rounded-full px-3 py-1.5 text-sm ${
								mode === m ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
							}`}
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
						className="w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
						className="w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
					/>
				)}

				<div className="flex flex-wrap items-center gap-2">
					<button
						type="submit"
						disabled={!text.trim() || parse.isPending}
						className="rounded-md bg-blue-600 px-4 py-3 text-base font-semibold text-white disabled:bg-gray-300"
					>
						{parse.isPending ? "解析中…" : "解析する"}
					</button>
					<button
						type="button"
						onClick={startManual}
						disabled={parse.isPending}
						className="rounded-md border border-gray-300 px-4 py-3 text-base text-gray-800"
					>
						手入力で登録
					</button>
					{onCancel && (
						<button type="button" onClick={onCancel} className="ml-auto px-2 py-3 text-sm text-gray-600">
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
		<div className="flex flex-col gap-3">
			{outcome.notice && (
				<p role="alert" className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
					{outcome.notice}
				</p>
			)}
			{drafts.length > 1 && (
				<p className="text-sm text-gray-700">{drafts.length}件の課題を見つけました。内容を確認してください</p>
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

			{saveError && (
				<p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800">
					保存できませんでした: {saveError}
				</p>
			)}

			<div className="sticky bottom-0 flex gap-2 border-t border-gray-200 bg-white/95 py-3">
				<button
					type="button"
					onClick={reset}
					disabled={saving}
					className="rounded-md border border-gray-300 px-4 py-3 text-base text-gray-800"
				>
					戻る
				</button>
				<button
					type="button"
					onClick={confirm}
					disabled={saving || drafts.length === 0}
					className="flex-1 rounded-md bg-blue-600 px-4 py-3 text-base font-semibold text-white disabled:bg-gray-300"
				>
					{saving ? "保存中…" : drafts.length > 1 ? `${drafts.length}件を登録` : "登録する"}
				</button>
			</div>
		</div>
	);
}
