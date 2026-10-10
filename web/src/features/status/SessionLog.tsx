import { useMemo, useState } from "react";
import {
	errorText,
	type SessionRow,
	useCreateSession,
	useDeleteSession,
	useNow,
	useSessions,
	useTaskOptions,
	useUpdateSession,
} from "./hooks";
import { DAY, fmtDate, fmtDuration, fmtTime, fromInput, startOfJstDay, toInput } from "./time";

const btn = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm active:bg-gray-100 disabled:opacity-50";
const field = "min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm";
const PROGRESS_OPTIONS = [0, 25, 50, 75, 100] as const;

function ProgressSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
	return (
		<select
			className={field}
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

function SessionItem({ session }: { session: SessionRow }) {
	const update = useUpdateSession();
	const remove = useDeleteSession();
	const [editing, setEditing] = useState(false);
	const [start, setStart] = useState(toInput(session.startAt));
	const [end, setEnd] = useState(toInput(session.endAt ?? session.startAt));
	const [progress, setProgress] = useState<number | null>(session.progress);
	const error = update.error ?? remove.error;

	const save = () => {
		const startAt = fromInput(start);
		const endAt = fromInput(end);
		if (startAt === null || endAt === null) return;
		update.mutate({ id: session.id, patch: { startAt, endAt, progress } }, { onSuccess: () => setEditing(false) });
	};

	return (
		<li className="rounded-xl border border-gray-200 bg-white p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="truncate font-medium">{session.taskTitle}</p>
					<p className="text-sm text-gray-600">
						{fmtTime(session.startAt)} 〜 {session.endAt === null ? "作業中" : fmtTime(session.endAt)}
						{session.endAt !== null && `(${fmtDuration(session.endAt - session.startAt)})`}
						{session.progress !== null && ` ・ ${session.progress}%`}
					</p>
					<p className="mt-1 flex gap-1 text-xs">
						{session.review === "needs_review" && (
							<span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">確認待ち</span>
						)}
						{session.edited && (
							<span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">編集済み</span>
						)}
					</p>
				</div>
				{!editing && session.endAt !== null && (
					<div className="flex shrink-0 gap-1">
						<button type="button" className={btn} onClick={() => setEditing(true)}>
							編集
						</button>
						<button
							type="button"
							className={`${btn} text-red-600`}
							disabled={remove.isPending}
							onClick={() => window.confirm("この作業記録を削除しますか?") && remove.mutate(session.id)}
						>
							削除
						</button>
					</div>
				)}
			</div>
			{editing && (
				<div className="mt-3 flex flex-col gap-2">
					<label className="flex flex-col gap-1 text-xs text-gray-600">
						開始
						<input
							type="datetime-local"
							className={field}
							value={start}
							onChange={(e) => setStart(e.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-1 text-xs text-gray-600">
						終了
						<input
							type="datetime-local"
							className={field}
							value={end}
							onChange={(e) => setEnd(e.target.value)}
						/>
					</label>
					<ProgressSelect value={progress} onChange={setProgress} />
					<div className="flex gap-2">
						<button
							type="button"
							className={`${btn} bg-blue-600 text-white`}
							disabled={update.isPending}
							onClick={save}
						>
							保存
						</button>
						<button type="button" className={btn} onClick={() => setEditing(false)}>
							やめる
						</button>
					</div>
				</div>
			)}
			{error && (
				<p role="alert" className="mt-2 text-sm text-red-600">
					{errorText(error)}
				</p>
			)}
		</li>
	);
}

function AddForm({ onDone }: { onDone: () => void }) {
	const tasks = useTaskOptions();
	const create = useCreateSession();
	const [taskId, setTaskId] = useState("");
	const [start, setStart] = useState(() => toInput(Date.now() - 60 * 60_000));
	const [end, setEnd] = useState(() => toInput(Date.now()));
	const [progress, setProgress] = useState<number | null>(null);
	const startAt = fromInput(start);
	const endAt = fromInput(end);

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-gray-300 p-3">
			<select className={field} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
				<option value="">タスクを選ぶ</option>
				{tasks.data?.map((t) => (
					<option key={t.id} value={t.id}>
						{t.title}
					</option>
				))}
			</select>
			<label className="flex flex-col gap-1 text-xs text-gray-600">
				開始
				<input
					type="datetime-local"
					className={field}
					value={start}
					onChange={(e) => setStart(e.target.value)}
				/>
			</label>
			<label className="flex flex-col gap-1 text-xs text-gray-600">
				終了
				<input type="datetime-local" className={field} value={end} onChange={(e) => setEnd(e.target.value)} />
			</label>
			<ProgressSelect value={progress} onChange={setProgress} />
			<div className="flex gap-2">
				<button
					type="button"
					className={`${btn} bg-blue-600 text-white`}
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
				<button type="button" className={btn} onClick={onDone}>
					やめる
				</button>
			</div>
			{create.error && (
				<p role="alert" className="text-sm text-red-600">
					{errorText(create.error)}
				</p>
			)}
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
			<div className="flex items-center justify-between">
				<h2 className="font-semibold">作業記録</h2>
				{!adding && (
					<button type="button" className={btn} onClick={() => setAdding(true)}>
						＋ 記録を追加
					</button>
				)}
			</div>
			{adding && <AddForm onDone={() => setAdding(false)} />}
			{sessions.isPending && <p className="text-sm text-gray-500">読み込み中…</p>}
			{sessions.isError && <p className="text-sm text-red-600">作業記録を取得できませんでした</p>}
			{sessions.data && groups.length === 0 && (
				<p className="text-sm text-gray-500">この期間の作業記録はありません</p>
			)}
			{groups.map(([day, items]) => {
				const total = items.reduce((sum, s) => sum + (s.endAt === null ? 0 : s.endAt - s.startAt), 0);
				return (
					<div key={day} className="flex flex-col gap-2">
						<h3 className="text-sm font-semibold text-gray-700">
							{fmtDate(day)} <span className="font-normal text-gray-500">合計 {fmtDuration(total)}</span>
						</h3>
						<ul className="flex flex-col gap-2">
							{[...items]
								.sort((a, b) => b.startAt - a.startAt)
								.map((s) => (
									<SessionItem key={s.id} session={s} />
								))}
						</ul>
					</div>
				);
			})}
			<button
				type="button"
				className="self-center text-sm text-gray-500 underline"
				onClick={() => setDays(days + 14)}
			>
				さらに前を見る
			</button>
		</section>
	);
}
