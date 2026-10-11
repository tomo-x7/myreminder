import { useMemo, useState } from "react";
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
import {
	DAY,
	formatJstDate,
	formatJstTime,
	fromDatetimeLocal,
	startOfJstDay,
	toDatetimeLocal,
} from "core/domain/date";
import { errorText } from "core/domain/errors";
import { fmtDuration } from "core/domain/work-log";
import { type SessionRow } from "core/api/types";
import { useCreateSession, useDeleteSession, useSessions, useUpdateSession } from "core/queries/sessions";
import { useNow } from "core/hooks/use-now";
import { useTaskOptions } from "core/queries/tasks";

/** 行の中の小さな文字ボタン */
const rowBtn = "inline-flex items-center rounded-sm px-2 py-0.5 text-xs active:bg-wash disabled:opacity-40";
const PROGRESS_OPTIONS = [0, 25, 50, 75, 100] as const;

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
function TimeRange({
	start,
	end,
	onStart,
	onEnd,
}: {
	start: string;
	end: string;
	onStart: (v: string) => void;
	onEnd: (v: string) => void;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			{(
				[
					["開始", start, onStart],
					["終了", end, onEnd],
				] as const
			).map(([label, value, onChange]) => (
				<label key={label} className="flex items-center gap-2 text-xs text-sub">
					<span className="w-7 shrink-0">{label}</span>
					<input
						type="datetime-local"
						className={inputClass}
						value={value}
						onChange={(e) => onChange(e.target.value)}
					/>
				</label>
			))}
		</div>
	);
}

function SessionItem({ session }: { session: SessionRow }) {
	const update = useUpdateSession();
	const remove = useDeleteSession();
	const [editing, setEditing] = useState(false);
	const [start, setStart] = useState(toDatetimeLocal(session.startAt));
	const [end, setEnd] = useState(toDatetimeLocal(session.endAt ?? session.startAt));
	const [progress, setProgress] = useState<number | null>(session.progress);
	const error = update.error ?? remove.error;

	const save = () => {
		const startAt = fromDatetimeLocal(start);
		const endAt = fromDatetimeLocal(end);
		if (startAt === null || endAt === null) return;
		update.mutate({ id: session.id, patch: { startAt, endAt, progress } }, { onSuccess: () => setEditing(false) });
	};

	// 編集を始めるたびに、いまの記録の値から入れ直す(やめた編集の値を引きずらない)
	const startEdit = () => {
		setStart(toDatetimeLocal(session.startAt));
		setEnd(toDatetimeLocal(session.endAt ?? session.startAt));
		setProgress(session.progress);
		update.reset();
		setEditing(true);
	};

	const canEdit = !editing && session.endAt !== null;
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
							<button type="button" className={`${rowBtn} text-sub`} onClick={startEdit}>
								編集
							</button>
							<button
								type="button"
								className={`${rowBtn} text-danger`}
								disabled={remove.isPending}
								onClick={() =>
									window.confirm("この作業記録を削除しますか?") && remove.mutate(session.id)
								}
							>
								削除
							</button>
						</div>
					)}
				</div>
			)}
			{editing && (
				<div className="flex flex-col gap-2 border-l-2 border-ink pl-3">
					<TimeRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
					<div className="flex gap-1.5">
						<ProgressSelect value={progress} onChange={setProgress} />
						<button type="button" className={btnPrimary} disabled={update.isPending} onClick={save}>
							保存
						</button>
						<button type="button" className={btnSecondary} onClick={() => setEditing(false)}>
							やめる
						</button>
					</div>
				</div>
			)}
			{error && <ErrorNotice>{errorText(error)}</ErrorNotice>}
		</li>
	);
}

function AddForm({ onDone }: { onDone: () => void }) {
	const tasks = useTaskOptions();
	const create = useCreateSession();
	const [taskId, setTaskId] = useState("");
	const [start, setStart] = useState(() => toDatetimeLocal(Date.now() - 60 * 60_000));
	const [end, setEnd] = useState(() => toDatetimeLocal(Date.now()));
	const [progress, setProgress] = useState<number | null>(null);
	const startAt = fromDatetimeLocal(start);
	const endAt = fromDatetimeLocal(end);

	return (
		<div className="flex flex-col gap-2 border-l-2 border-ink pl-3">
			<select className={inputClass} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
				<option value="">タスクを選ぶ</option>
				{tasks.data?.map((t) => (
					<option key={t.id} value={t.id}>
						{t.title}
					</option>
				))}
			</select>
			<TimeRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
			<div className="flex gap-1.5">
				<ProgressSelect value={progress} onChange={setProgress} />
				<button
					type="button"
					className={btnPrimary}
					disabled={!taskId || startAt === null || endAt === null || create.isPending}
					onClick={() =>
						taskId &&
						startAt !== null &&
						endAt !== null &&
						create.mutate({ taskId, startAt, endAt, progress }, { onSuccess: onDone })
					}
				>
					追加
				</button>
				<button type="button" className={btnSecondary} onClick={onDone}>
					やめる
				</button>
			</div>
			{create.error && <ErrorNotice>{errorText(create.error)}</ErrorNotice>}
		</div>
	);
}

/** 作業記録の一覧(JST の日ごと、新しい順)と、追加・編集・削除 */
export function SessionLog({ initialDays = 14 }: { initialDays?: number }) {
	const now = useNow(60_000);
	const [days, setDays] = useState(initialDays);
	const [adding, setAdding] = useState(false);
	const from = startOfJstDay(now) - (days - 1) * DAY;
	const to = startOfJstDay(now) + DAY;
	const sessions = useSessions(from, to);

	const groups = useMemo(() => {
		const byDay = new Map<number, SessionRow[]>();
		for (const s of sessions.data ?? []) {
			const day = startOfJstDay(s.startAt);
			byDay.set(day, [...(byDay.get(day) ?? []), s]);
		}
		return [...byDay.entries()].sort((a, b) => b[0] - a[0]);
	}, [sessions.data]);

	return (
		<section className="flex flex-col gap-3">
			<div className="flex min-h-9 items-center justify-between gap-2">
				<h2 className="text-base font-bold">作業記録</h2>
				{!adding && (
					<button type="button" className={btnSecondary} onClick={() => setAdding(true)}>
						＋ 記録を追加
					</button>
				)}
			</div>
			{adding && <AddForm onDone={() => setAdding(false)} />}
			{sessions.isPending && <p className="text-xs text-faint">読み込み中…</p>}
			{sessions.isError && <ErrorNotice>作業記録を取得できませんでした</ErrorNotice>}
			{sessions.data && groups.length === 0 && <Empty>この期間の作業記録はありません</Empty>}
			{groups.map(([day, items]) => {
				const total = items.reduce((sum, s) => sum + (s.endAt === null ? 0 : s.endAt - s.startAt), 0);
				return (
					<div key={day} className="flex flex-col">
						<SectionTitle action={<span className="text-xs text-sub">合計 {fmtDuration(total)}</span>}>
							{formatJstDate(day)}
						</SectionTitle>
						<ul className={listClass}>
							{[...items]
								.sort((a, b) => b.startAt - a.startAt)
								.map((s) => (
									<SessionItem key={s.id} session={s} />
								))}
						</ul>
					</div>
				);
			})}
			<button type="button" className={`${btnGhost} self-center`} onClick={() => setDays(days + 14)}>
				さらに前を見る
			</button>
		</section>
	);
}
