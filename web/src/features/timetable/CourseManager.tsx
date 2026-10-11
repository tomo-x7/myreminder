import type { Course } from "core/api/types";
import { aliasesText, useCourseForm } from "core/forms/course";
import { useCourses } from "core/queries/courses";
import { useState } from "react";
import { Sheet } from "../../components/Sheet";
import {
	btnDanger,
	btnPrimary,
	btnSecondary,
	ErrorNotice,
	Field,
	inputClass,
	listClass,
	SectionTitle,
} from "../../components/ui";

function CourseForm({ course, onDone }: { course?: Course; onDone: () => void }) {
	const { form, set, canSave, saving, error, save, remove } = useCourseForm(course, onDone);
	const [confirming, setConfirming] = useState(false);

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			<Field label="科目名">
				<input
					type="text"
					value={form.name}
					maxLength={100}
					onChange={(e) => set("name", e.target.value)}
					className={inputClass}
				/>
			</Field>
			<Field label="別名">
				<input
					type="text"
					value={form.aliases}
					onChange={(e) => set("aliases", e.target.value)}
					placeholder="カンマ区切り"
					className={inputClass}
				/>
			</Field>
			{error && <ErrorNotice>保存失敗: {error}</ErrorNotice>}
			<div className="flex gap-2">
				<button type="submit" disabled={saving || !canSave} className={`${btnPrimary} flex-1`}>
					{saving ? "保存中…" : "保存"}
				</button>
				{course && !confirming && (
					<button type="button" className={btnDanger} onClick={() => setConfirming(true)}>
						削除
					</button>
				)}
			</div>
			{course && confirming && (
				<div className="flex flex-col gap-2">
					<p>「{course.name}」を削除(タスクは科目なしになる)</p>
					<div className="grid grid-cols-2 gap-2">
						<button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>
							やめる
						</button>
						<button type="button" className={btnDanger} disabled={saving} onClick={remove}>
							削除
						</button>
					</div>
				</div>
			)}
		</form>
	);
}

/** 科目の一覧と追加・名前/別名の編集・削除 */
export function CourseManager() {
	const courses = useCourses();
	const [editing, setEditing] = useState<Course | "new" | null>(null);
	const close = () => setEditing(null);

	return (
		<section className="flex flex-col">
			<SectionTitle
				action={
					<button
						type="button"
						onClick={() => setEditing("new")}
						className="-mb-0.5 rounded-sm px-1 py-0.5 text-xs text-sub active:bg-wash"
					>
						＋ 追加
					</button>
				}
			>
				科目
			</SectionTitle>
			{courses.isError && <ErrorNotice>科目の読み込み失敗</ErrorNotice>}
			{courses.data?.length === 0 && <p className="py-2 text-xs text-faint">なし</p>}
			<ul className={listClass}>
				{courses.data?.map((c) => (
					<li key={c.id}>
						<button
							type="button"
							onClick={() => setEditing(c)}
							className="flex w-full items-baseline gap-2 py-2 text-left active:bg-wash"
						>
							<span className="shrink-0 font-medium">{c.name}</span>
							<span className="min-w-0 flex-1 truncate text-xs text-sub">{aliasesText(c)}</span>
							<span aria-hidden="true" className="text-faint">
								›
							</span>
						</button>
					</li>
				))}
			</ul>
			{editing && (
				<Sheet title={editing === "new" ? "科目追加" : "科目編集"} onClose={close}>
					<CourseForm course={editing === "new" ? undefined : editing} onDone={close} />
				</Sheet>
			)}
		</section>
	);
}
