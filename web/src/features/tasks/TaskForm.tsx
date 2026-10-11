import { useState } from "react";
import { DueLabel } from "../../components/DueLabel";
import { btnPrimary, ErrorNotice, Field, inputClass, Notice } from "../../components/ui";
import { fromDatetimeLocal, toDatetimeLocal } from "core/domain/date";
import { type Course, type Task, type TaskPatch } from "core/api/types";
import { STATUS_LABEL, STATUS_ORDER, type TaskStatus } from "core/domain/task-status";
import { CATEGORY_OPTIONS } from "core/domain/draft-types";

type Props = {
	task: Task;
	courses: readonly Course[];
	now: number;
	saving: boolean;
	error: string | null;
	onSave: (patch: TaskPatch) => void;
};

type Form = {
	title: string;
	courseId: string;
	category: Task["category"];
	dueLocal: string;
	releaseLocal: string;
	plannedLocal: string;
	estimateMin: string;
	minBlockMin: string;
	firstStep: string;
	note: string;
	status: TaskStatus;
};

const optLocal = (ms: number | null) => (ms === null ? "" : toDatetimeLocal(ms));

const toForm = (t: Task): Form => ({
	title: t.title,
	courseId: t.courseId ?? "",
	category: t.category,
	dueLocal: toDatetimeLocal(t.dueAt),
	releaseLocal: optLocal(t.releaseAt),
	plannedLocal: optLocal(t.plannedStartAt),
	estimateMin: String(t.estimateMin),
	minBlockMin: String(t.minBlockMin),
	firstStep: t.firstStep ?? "",
	note: t.note ?? "",
	status: t.status,
});

const isPositiveInt = (s: string) => Number.isInteger(Number(s)) && Number(s) >= 1;

/** 入力 → 更新内容。不正な欄の名前を errors に返す */
function toPatch(f: Form, task: Task): { patch: TaskPatch } | { errors: Partial<Record<keyof Form, string>> } {
	const errors: Partial<Record<keyof Form, string>> = {};
	const dueAt = fromDatetimeLocal(f.dueLocal);
	if (!f.title.trim()) errors.title = "タイトルを入力してください";
	if (dueAt === null) errors.dueLocal = "締切を入力してください";
	if (!isPositiveInt(f.estimateMin)) errors.estimateMin = "1分以上の整数で入力してください";
	if (!isPositiveInt(f.minBlockMin)) errors.minBlockMin = "1分以上の整数で入力してください";
	if (Object.keys(errors).length > 0 || dueAt === null) return { errors };

	const estimateMin = Number(f.estimateMin);
	return {
		patch: {
			title: f.title.trim(),
			courseId: f.courseId || null,
			category: f.category,
			dueAt,
			releaseAt: fromDatetimeLocal(f.releaseLocal),
			plannedStartAt: fromDatetimeLocal(f.plannedLocal),
			estimateMin,
			// 本人が見積もりを直したら手入力扱いにする
			...(estimateMin !== task.estimateMin ? { estimateSource: "manual" as const } : {}),
			minBlockMin: Number(f.minBlockMin),
			firstStep: f.firstStep.trim() || null,
			note: f.note.trim() || null,
			status: f.status,
		},
	};
}

/** タスクの全項目の編集フォーム */
export function TaskForm({ task, courses, now, saving, error, onSave }: Props) {
	const [form, setForm] = useState<Form>(() => toForm(task));
	const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
	const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
	const dueAt = fromDatetimeLocal(form.dueLocal);

	function submit() {
		const r = toPatch(form, task);
		if ("errors" in r) {
			setErrors(r.errors);
			return;
		}
		setErrors({});
		onSave(r.patch);
	}

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			{dueAt !== null && <DueLabel dueAt={dueAt} now={now} size="lg" />}

			<Field label="状態">
				<select
					value={form.status}
					onChange={(e) => set("status", e.target.value as TaskStatus)}
					className={inputClass}
				>
					{STATUS_ORDER.map((s) => (
						<option key={s} value={s}>
							{STATUS_LABEL[s]}
						</option>
					))}
				</select>
			</Field>
			{form.status === "done" && (
				<Notice tone="warn">完了(未提出)です。提出したら「提出済み」にしてください</Notice>
			)}

			<Field label="タイトル" error={errors.title}>
				<input
					type="text"
					value={form.title}
					maxLength={200}
					onChange={(e) => set("title", e.target.value)}
					className={inputClass}
				/>
			</Field>

			<Field label="締切(日本時間)" error={errors.dueLocal}>
				<input
					type="datetime-local"
					value={form.dueLocal}
					onChange={(e) => set("dueLocal", e.target.value)}
					className={inputClass}
				/>
			</Field>

			<div className="grid grid-cols-2 gap-2">
				<Field label="科目">
					<select
						value={form.courseId}
						onChange={(e) => set("courseId", e.target.value)}
						className={inputClass}
					>
						<option value="">なし</option>
						{courses.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="種類">
					<select
						value={form.category}
						onChange={(e) => set("category", e.target.value as Task["category"])}
						className={inputClass}
					>
						{CATEGORY_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</Field>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<Field
					label="見積もり(分)"
					error={errors.estimateMin}
					hint={task.estimateSource === "ai" ? "AI の見積もり" : undefined}
				>
					<input
						type="number"
						inputMode="numeric"
						min={1}
						value={form.estimateMin}
						onChange={(e) => set("estimateMin", e.target.value)}
						className={inputClass}
					/>
				</Field>
				<Field label="最小の作業単位(分)" error={errors.minBlockMin}>
					<input
						type="number"
						inputMode="numeric"
						min={1}
						value={form.minBlockMin}
						onChange={(e) => set("minBlockMin", e.target.value)}
						className={inputClass}
					/>
				</Field>
			</div>

			<Field label="最初の一歩(任意)">
				<input
					type="text"
					value={form.firstStep}
					maxLength={200}
					onChange={(e) => set("firstStep", e.target.value)}
					placeholder="例: テンプレを開いて見出しだけ書く"
					className={inputClass}
				/>
			</Field>

			<div className="grid grid-cols-2 gap-2">
				<Field label="着手する時刻(任意)" hint="決めた時刻に合図します">
					<input
						type="datetime-local"
						value={form.plannedLocal}
						onChange={(e) => set("plannedLocal", e.target.value)}
						className={inputClass}
					/>
				</Field>

				<Field label="公開日時(任意)" hint="これより前は着手できない課題のとき">
					<input
						type="datetime-local"
						value={form.releaseLocal}
						onChange={(e) => set("releaseLocal", e.target.value)}
						className={inputClass}
					/>
				</Field>
			</div>

			<Field label="メモ(任意)">
				<textarea
					rows={3}
					value={form.note}
					maxLength={2000}
					onChange={(e) => set("note", e.target.value)}
					className={inputClass}
				/>
			</Field>

			{error && <ErrorNotice>保存できませんでした: {error}</ErrorNotice>}
			<button type="submit" disabled={saving} className={`${btnPrimary} w-full`}>
				{saving ? "保存中…" : "保存"}
			</button>
		</form>
	);
}
