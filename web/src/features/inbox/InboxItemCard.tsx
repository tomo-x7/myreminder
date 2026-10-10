import { useState } from "react";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice, inputClass } from "../../components/ui";
import { formatDue, formatJstDateTime } from "../../lib/date";
import type { Course, Task } from "../../lib/queries";
import { CandidateCard } from "../quick-add/CandidateCard";
import { draftToInput, hasProblems, validateDraft } from "../quick-add/draft";
import type { Draft, StartSuggestion } from "../quick-add/types";
import { itemToDraft, SOURCE_LABEL } from "./draft";
import { type InboxCandidate, type InboxItem, useAcceptItem, useIgnoreItem, useLinkItem } from "./hooks";

type Props = {
	item: InboxItem;
	courses: readonly Course[];
	tasks: readonly Task[];
	startSuggestions: readonly StartSuggestion[];
	now: number;
};

const REASON_LABEL: Record<InboxCandidate["reason"], string> = {
	same_title: "同じタイトル",
	similar_title: "タイトルが似ている",
	near_due: "同じ科目で締切が近い",
};

const STATE_NOTE: Record<string, string> = {
	TURNED_IN: "取り込み元では提出済み",
	RETURNED: "取り込み元では返却済み",
};

type Panel = "add" | "link" | null;

/** 承認待ちの1件。[追加] [紐付け] [無視]。重複の候補があれば [紐付け] を先に開く */
export function InboxItemCard({ item, courses, tasks, startSuggestions, now }: Props) {
	const hasCandidates = item.candidates.length > 0;
	const [panel, setPanel] = useState<Panel>(hasCandidates ? "link" : null);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [showProblems, setShowProblems] = useState(false);
	const [otherTaskId, setOtherTaskId] = useState("");
	const accept = useAcceptItem();
	const link = useLinkItem();
	const ignore = useIgnoreItem();
	const busy = accept.isPending || link.isPending || ignore.isPending;
	const error = accept.error ?? link.error ?? ignore.error;

	function startAdd() {
		setDraft((d) => d ?? itemToDraft(item, courses));
		setPanel("add");
	}

	function save() {
		if (!draft) return;
		if (hasProblems(validateDraft(draft))) {
			setShowProblems(true);
			return;
		}
		accept.mutate({ id: item.id, input: draftToInput(draft, courses) });
	}

	const candidateIds = new Set(item.candidates.map((c) => c.taskId));
	const others = tasks
		.filter((t) => t.status !== "dismissed" && !candidateIds.has(t.id))
		.sort((a, b) => a.dueAt - b.dueAt);
	const note = item.remoteState ? STATE_NOTE[item.remoteState] : undefined;

	return (
		<li className="flex flex-col gap-3 rounded-xl border border-gray-300 bg-white p-4">
			<div className="flex flex-col gap-1">
				{item.dueAt === null ? (
					<p className="text-base font-bold text-gray-500">締切なし</p>
				) : (
					<DueLabel dueAt={item.dueAt} now={now} />
				)}
				<p className="text-lg font-bold text-gray-900">{item.title}</p>
				<p className="text-xs text-gray-600">
					{[item.courseName, SOURCE_LABEL[item.source] ?? item.source, note].filter(Boolean).join(" ・ ")}
				</p>
				{item.url && (
					<a
						href={item.url}
						target="_blank"
						rel="noreferrer"
						className="w-fit text-sm font-medium text-blue-700 underline"
					>
						{item.source === "classroom" ? "Classroom で開く" : "取り込み元で開く"}
					</a>
				)}
				{item.description && (
					<details className="text-sm text-gray-700">
						<summary className="cursor-pointer py-1 text-gray-600">本文を見る</summary>
						<p className="whitespace-pre-wrap break-words rounded-md bg-gray-50 p-2">{item.description}</p>
					</details>
				)}
			</div>

			{error && <ErrorNotice>{error.message}</ErrorNotice>}

			<div className="flex gap-2">
				<button
					type="button"
					disabled={busy}
					onClick={startAdd}
					aria-pressed={panel === "add"}
					className={`${hasCandidates ? btnSecondary : btnPrimary} flex-1 px-2`}
				>
					追加
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => setPanel("link")}
					aria-pressed={panel === "link"}
					className={`${hasCandidates ? btnPrimary : btnSecondary} flex-1 px-2`}
				>
					紐付け
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => ignore.mutate(item.id)}
					className={`${btnSecondary} flex-1 px-2`}
				>
					無視
				</button>
			</div>

			{panel === "link" && (
				<div className="flex flex-col gap-2">
					{hasCandidates && (
						<>
							<p className="text-sm font-semibold text-gray-800">同じ課題かもしれないタスク</p>
							<ul className="flex flex-col gap-2">
								{item.candidates.map((c) => (
									<li
										key={c.taskId}
										className="flex flex-col gap-1 rounded-lg border border-blue-300 bg-blue-50 p-3"
									>
										<span className="text-base font-semibold text-gray-900">{c.title}</span>
										<span className="text-sm text-gray-700">
											{formatDue(c.dueAt, now)}
											{c.status === "submitted" ? " ・ 提出済み" : ""}
										</span>
										<span className="text-xs text-gray-600">
											{[c.courseName, REASON_LABEL[c.reason]].filter(Boolean).join(" ・ ")}
										</span>
										<button
											type="button"
											disabled={busy}
											onClick={() => link.mutate({ id: item.id, taskId: c.taskId })}
											className={`${btnPrimary} mt-1 py-2`}
										>
											このタスクに紐付ける
										</button>
									</li>
								))}
							</ul>
						</>
					)}
					<label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
						{hasCandidates ? "ほかのタスクに紐付ける" : "紐付けるタスク"}
						<select
							value={otherTaskId}
							disabled={busy}
							onChange={(e) => setOtherTaskId(e.target.value)}
							className={inputClass}
						>
							<option value="">選んでください</option>
							{others.map((t) => (
								<option key={t.id} value={t.id}>
									{formatJstDateTime(t.dueAt)} {t.title}
								</option>
							))}
						</select>
					</label>
					<button
						type="button"
						disabled={busy || otherTaskId === ""}
						onClick={() => link.mutate({ id: item.id, taskId: otherTaskId })}
						className={btnSecondary}
					>
						選んだタスクに紐付ける
					</button>
					<p className="text-xs text-gray-500">
						タスクの中身は変わりません。以後、取り込み元の変化が伝わります
					</p>
				</div>
			)}

			{panel === "add" && draft && (
				<div className="flex flex-col gap-2">
					<CandidateCard
						draft={draft}
						showProblems={showProblems}
						problems={validateDraft(draft)}
						courses={courses}
						startSuggestions={startSuggestions}
						now={now}
						disabled={busy}
						onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
					/>
					<button type="button" disabled={busy} onClick={save} className={btnPrimary}>
						{accept.isPending ? "保存中…" : "タスクとして保存"}
					</button>
				</div>
			)}
		</li>
	);
}
