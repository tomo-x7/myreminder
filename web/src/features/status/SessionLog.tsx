import type { SessionRow } from "core/api/types";
import { formatJstDate, formatJstTime } from "core/domain/date";
import { PROGRESS_OPTIONS } from "core/domain/session";
import { fmtDuration } from "core/domain/work-log";
import { type SessionForm, useSessionAdd, useSessionEdit, useSessionLog } from "core/forms/session";
import { useState } from "react";
import { DatetimeInput } from "../../components/DateTimeInputs";
import {
	btnGhost,
	btnPrimary,
	btnSecondary,
	Empty,
	ErrorNotice,
	inputClass,
	listClass,
	SectionTitle,
	Tag,
} from "../../components/ui";

/** 行の中の小さな文字ボタン */
const rowBtn = "inline-flex items-center rounded-sm px-2 py-0.5 text-xs active:bg-wash disabled:opacity-40";

function ProgressSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
	return (
		<select
			className={`${inputClass} min-w-0 flex-1`}
			value={value ?? ""}
			onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
		>
			<option value="">進捗なし</option>
			{PROGRESS_OPTIONS.map((p) => (
				<option key={p} value={p}>
					{p}%
				</option>
			))}
		</select>
	);
}

/** 開始と終了の入力。ラベルは左に置いて縦を詰める */
function TimeRange({ form, onChange }: { form: SessionForm; onChange: (patch: Partial<SessionForm>) => void }) {
	return (
		<div className="flex flex-col gap-1.5">
			{(
				[
					["開始", form.startAt, (startAt: number | null) => onChange({ startAt })],
					["終了", form.endAt, (endAt: number | null) => onChange({ endAt })],
				] as const
			).map(([label, value, change]) => (
				// biome-ignore lint/a11y/noLabelWithoutControl: DatetimeInput が input を描く
				<label key={label} className="flex items-center gap-2 text-xs text-sub">
					<span className="w-7 shrink-0">{label}</span>
					<DatetimeInput className={inputClass} value={value} onChange={change} />
				</label>
			))}
		</div>
	);
}

function SessionItem({ session }: { session: SessionRow }) {
	const edit = useSessionEdit(session);
	const { editing, canEdit } = edit;

	const hasMeta = session.progress !== null || session.review === "needs_review" || session.edited;

	return (
		<li className="flex flex-col gap-1 py-2">
			<div className="flex items-baseline gap-2">
				<span className="w-24 shrink-0 text-xs text-sub">
					{formatJstTime(session.startAt)}〜{session.endAt === null ? "作業中" : formatJstTime(session.endAt)}
				</span>
				<span className="min-w-0 flex-1 font-medium">{session.taskTitle}</span>
				{session.endAt !== null && (
					<span className="shrink-0 text-xs text-sub">{fmtDuration(session.endAt - session.startAt)}</span>
				)}
			</div>
			{(hasMeta || canEdit) && (
				<div className="flex min-h-6 items-center gap-1 pl-26">
					{session.progress !== null && <span className="mr-1 text-xs text-sub">{session.progress}%</span>}
					{session.review === "needs_review" && <Tag tone="warn">確認待ち</Tag>}
					{session.edited && <Tag>編集済み</Tag>}
					{canEdit && (
						<div className="ml-auto flex shrink-0 gap-0.5">
							<button type="button" className={`${rowBtn} text-sub`} onClick={edit.startEdit}>
								編集
							</button>
							<button
								type="button"
								className={`${rowBtn} text-danger`}
								disabled={edit.removing}
								onClick={() => window.confirm("削除する?") && edit.remove()}
							>
								削除
							</button>
						</div>
					)}
				</div>
			)}
			{editing && (
				<div className="flex flex-col gap-2 border-l-2 border-ink pl-3">
					<TimeRange form={edit.form} onChange={edit.change} />
					<div className="flex gap-1.5">
						<ProgressSelect value={edit.form.progress} onChange={(progress) => edit.change({ progress })} />
						<button type="button" className={btnPrimary} disabled={edit.saving} onClick={edit.save}>
							保存
						</button>
						<button type="button" className={btnSecondary} onClick={edit.cancel}>
							やめる
						</button>
					</div>
				</div>
			)}
			{edit.errorMessage && <ErrorNotice>{edit.errorMessage}</ErrorNotice>}
		</li>
	);
}

function AddForm({ onDone }: { onDone: () => void }) {
	const f = useSessionAdd(onDone);

	return (
		<div className="flex flex-col gap-2 border-l-2 border-ink pl-3">
			<select className={inputClass} value={f.taskId} onChange={(e) => f.setTaskId(e.target.value)}>
				<option value="">タスク</option>
				{f.tasks?.map((t) => (
					<option key={t.id} value={t.id}>
						{t.title}
					</option>
				))}
			</select>
			<TimeRange form={f.form} onChange={f.change} />
			<div className="flex gap-1.5">
				<ProgressSelect value={f.form.progress} onChange={(progress) => f.change({ progress })} />
				<button type="button" className={btnPrimary} disabled={!f.canSubmit} onClick={f.submit}>
					追加
				</button>
				<button type="button" className={btnSecondary} onClick={onDone}>
					やめる
				</button>
			</div>
			{f.errorMessage && <ErrorNotice>{f.errorMessage}</ErrorNotice>}
		</div>
	);
}

/** 作業記録の一覧(JST の日ごと、新しい順)と、追加・編集・削除 */
export function SessionLog({ initialDays = 14 }: { initialDays?: number }) {
	const { sessions, groups, loadMore } = useSessionLog(initialDays);
	const [adding, setAdding] = useState(false);

	return (
		<section className="flex flex-col gap-3">
			<div className="flex min-h-9 items-center justify-between gap-2">
				<h2 className="text-base font-bold">作業記録</h2>
				{!adding && (
					<button type="button" className={btnSecondary} onClick={() => setAdding(true)}>
						＋ 追加
					</button>
				)}
			</div>
			{adding && <AddForm onDone={() => setAdding(false)} />}
			{sessions.isPending && <p className="text-xs text-faint">読み込み中…</p>}
			{sessions.isError && <ErrorNotice>取得エラー</ErrorNotice>}
			{sessions.data && groups.length === 0 && <Empty>なし</Empty>}
			{groups.map(({ day, items, totalMs }) => (
				<div key={day} className="flex flex-col">
					<SectionTitle action={<span className="text-xs text-sub">合計 {fmtDuration(totalMs)}</span>}>
						{formatJstDate(day)}
					</SectionTitle>
					<ul className={listClass}>
						{items.map((s) => (
							<SessionItem key={s.id} session={s} />
						))}
					</ul>
				</div>
			))}
			<button type="button" className={`${btnGhost} self-center`} onClick={loadMore}>
				さらに前
			</button>
		</section>
	);
}
