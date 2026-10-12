import type { Course, InboxItem, StartSuggestion, Task } from "core/api/types";
import { candidateMeta, itemMeta, openSourceLabel, taskOptionLabel } from "core/domain/inbox";
import { useInboxItemForm } from "core/forms/inbox";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, btnSecondary, ErrorNotice, Field, inputClass, linkClass, listClass } from "../../components/ui";
import { CandidateCard } from "../quick-add/CandidateCard";

type Props = {
	item: InboxItem;
	courses: readonly Course[];
	tasks: readonly Task[];
	startSuggestions: readonly StartSuggestion[];
	now: number;
};

/** 承認待ちの1件。[追加] [紐付け] [無視]。重複の候補があれば [紐付け] を先に開く */
export function InboxItemCard({ item, courses, tasks, startSuggestions, now }: Props) {
	const f = useInboxItemForm(item, courses, tasks);
	const { hasCandidates, panel, draft } = f;

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
					{itemMeta(item)}
					{item.url && (
						<a href={item.url} target="_blank" rel="noreferrer" className={linkClass}>
							{openSourceLabel(item.source)}
						</a>
					)}
				</p>
				{item.description && (
					<details className="text-xs text-sub">
						<summary className="cursor-pointer py-0.5">本文</summary>
						<p className="border-l-2 border-line pl-2 break-words whitespace-pre-wrap">
							{item.description}
						</p>
					</details>
				)}
			</div>

			{f.errorMessage && <ErrorNotice>{f.errorMessage}</ErrorNotice>}

			<div className="flex gap-1.5">
				<button
					type="button"
					disabled={f.busy}
					onClick={f.openAdd}
					aria-pressed={panel === "add"}
					className={`${!hasCandidates && panel !== "add" ? btnPrimary : btnSecondary} flex-1`}
				>
					追加
				</button>
				<button
					type="button"
					disabled={f.busy}
					onClick={f.openLink}
					aria-pressed={panel === "link"}
					className={`${hasCandidates ? btnPrimary : btnSecondary} flex-1`}
				>
					紐付け
				</button>
				<button type="button" disabled={f.busy} onClick={f.ignore} className={`${btnSecondary} flex-1`}>
					無視
				</button>
			</div>

			{panel === "link" && (
				<div className="flex flex-col gap-2 border-l-2 border-ink pl-2">
					{hasCandidates && (
						<div className="flex flex-col">
							<p className="text-xs font-semibold text-sub">重複の候補</p>
							<ul className={listClass}>
								{item.candidates.map((c) => (
									<li key={c.taskId} className="flex flex-col gap-0.5 py-1.5">
										<div className="flex items-center justify-between gap-2">
											<span className="min-w-0 font-semibold">{c.title}</span>
											<button
												type="button"
												disabled={f.busy}
												onClick={() => f.linkTo(c.taskId)}
												className={`${btnSecondary} shrink-0`}
											>
												紐付け
											</button>
										</div>
										<span className="text-xs text-sub">{candidateMeta(c, now)}</span>
									</li>
								))}
							</ul>
						</div>
					)}
					<div className="flex items-end gap-1.5">
						<div className="min-w-0 flex-1">
							<Field label={hasCandidates ? "ほかのタスク" : "タスク"}>
								<select
									value={f.otherTaskId}
									disabled={f.busy}
									onChange={(e) => f.setOtherTaskId(e.target.value)}
									className={inputClass}
								>
									<option value="">-</option>
									{f.linkable.map((t) => (
										<option key={t.id} value={t.id}>
											{taskOptionLabel(t)}
										</option>
									))}
								</select>
							</Field>
						</div>
						<button
							type="button"
							disabled={f.busy || f.otherTaskId === ""}
							onClick={f.linkSelected}
							className={`${btnSecondary} shrink-0`}
						>
							紐付け
						</button>
					</div>
				</div>
			)}

			{panel === "add" && draft && (
				<div className="flex flex-col gap-2">
					<CandidateCard
						draft={draft}
						hideRepeat
						showProblems={f.showProblems}
						problems={f.problems}
						courses={courses}
						startSuggestions={startSuggestions}
						now={now}
						disabled={f.busy}
						onChange={f.editDraft}
					/>
					<button type="button" disabled={f.busy} onClick={f.save} className={btnPrimary}>
						{f.saving ? "保存中…" : "追加"}
					</button>
				</div>
			)}
		</li>
	);
}
