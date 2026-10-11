import { errorText } from "core/domain/errors";
import { useState } from "react";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice, Field, inputClass, linkClass, listClass } from "../../components/ui";
import { formatDue, formatJstDateTime } from "core/domain/date";
import { type Course, type Task, type InboxCandidate, type InboxItem } from "core/api/types";
import { itemToDraft, SOURCE_LABEL } from "core/domain/inbox-draft";
import { useAcceptItem, useIgnoreItem, useLinkItem } from "core/queries/inbox";
import { CandidateCard } from "../quick-add/CandidateCard";
import { draftToInput, hasProblems, validateDraft } from "core/domain/draft";
import type { Draft, StartSuggestion } from "core/domain/draft-types";

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
		<li className="flex flex-col gap-2 py-2">
			<div className="flex flex-col gap-0.5">
				{item.dueAt === null ? (
					<p className="text-sm font-semibold text-sub">締切なし</p>
				) : (
					<DueLabel dueAt={item.dueAt} now={now} />
				)}
				<p className="text-base leading-snug font-semibold">{item.title}</p>
				<p className="flex flex-wrap items-baseline gap-x-2 text-xs text-sub">
					{[item.courseName, SOURCE_LABEL[item.source] ?? item.source, note].filter(Boolean).join(" ・ ")}
					{item.url && (
						<a href={item.url} target="_blank" rel="noreferrer" className={linkClass}>
							{item.source === "classroom" ? "Classroom で開く" : "取り込み元で開く"}
						</a>
					)}
				</p>
				{item.description && (
					<details className="text-xs text-sub">
						<summary className="cursor-pointer py-0.5">本文を見る</summary>
						<p className="border-l-2 border-line pl-2 break-words whitespace-pre-wrap">
							{item.description}
						</p>
					</details>
				)}
			</div>

			{error && <ErrorNotice>{errorText(error)}</ErrorNotice>}

			<div className="flex gap-1.5">
				<button
					type="button"
					disabled={busy}
					onClick={startAdd}
					aria-pressed={panel === "add"}
					className={`${!hasCandidates && panel !== "add" ? btnPrimary : btnSecondary} flex-1`}
				>
					追加
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => setPanel("link")}
					aria-pressed={panel === "link"}
					className={`${hasCandidates ? btnPrimary : btnSecondary} flex-1`}
				>
					紐付け
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => ignore.mutate(item.id)}
					className={`${btnSecondary} flex-1`}
				>
					無視
				</button>
			</div>

			{panel === "link" && (
				<div className="flex flex-col gap-2 border-l-2 border-ink pl-2">
					{hasCandidates && (
						<div className="flex flex-col">
							<p className="text-xs font-semibold text-sub">同じ課題かもしれないタスク</p>
							<ul className={listClass}>
								{item.candidates.map((c) => (
									<li key={c.taskId} className="flex flex-col gap-0.5 py-1.5">
										<div className="flex items-center justify-between gap-2">
											<span className="min-w-0 font-semibold">{c.title}</span>
											<button
												type="button"
												disabled={busy}
												onClick={() => link.mutate({ id: item.id, taskId: c.taskId })}
												className={`${btnSecondary} shrink-0`}
											>
												このタスクに紐付ける
											</button>
										</div>
										<span className="text-xs text-sub">
											{[
												formatDue(c.dueAt, now),
												c.status === "submitted" ? "提出済み" : null,
												c.courseName,
												REASON_LABEL[c.reason],
											]
												.filter(Boolean)
												.join(" ・ ")}
										</span>
									</li>
								))}
							</ul>
						</div>
					)}
					<div className="flex items-end gap-1.5">
						<div className="min-w-0 flex-1">
							<Field label={hasCandidates ? "ほかのタスクに紐付ける" : "紐付けるタスク"}>
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
							</Field>
						</div>
						<button
							type="button"
							disabled={busy || otherTaskId === ""}
							onClick={() => link.mutate({ id: item.id, taskId: otherTaskId })}
							className={`${btnSecondary} shrink-0`}
						>
							選んだタスクに紐付ける
						</button>
					</div>
					<p className="text-xs text-faint">タスクの中身は変わりません。以後、取り込み元の変化が伝わります</p>
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
