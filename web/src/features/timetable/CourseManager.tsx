import { errorText } from "core/domain/errors";
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
import { type Course } from "core/api/types";
import { useCourses, useCreateCourse, useDeleteCourse, useUpdateCourse } from "core/queries/courses";

/** `a, b、c` → ["a","b","c"] */
const parseAliases = (s: string) =>
	s
		.split(/[,、，\n]/)
		.map((a) => a.trim())
		.filter(Boolean);

function CourseForm({ course, onDone }: { course?: Course; onDone: () => void }) {
	const create = useCreateCourse();
	const update = useUpdateCourse();
	const remove = useDeleteCourse();
	const [name, setName] = useState(course?.name ?? "");
	const [aliases, setAliases] = useState(course?.aliases.join(", ") ?? "");
	const [confirming, setConfirming] = useState(false);
	const saving = create.isPending || update.isPending || remove.isPending;
	const error = create.error ?? update.error ?? remove.error;

	function save() {
		if (!name.trim()) return;
		const json = { name: name.trim(), aliases: parseAliases(aliases) };
		if (course) update.mutate({ id: course.id, patch: json }, { onSuccess: onDone });
		else create.mutate(json, { onSuccess: onDone });
	}

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
					value={name}
					maxLength={100}
					onChange={(e) => setName(e.target.value)}
					className={inputClass}
				/>
			</Field>
			<Field
				label="別名(任意)"
				hint="ポータルやメールでの表記ゆれを、カンマ区切りで。AI が科目を当てるのに使います"
			>
				<input
					type="text"
					value={aliases}
					onChange={(e) => setAliases(e.target.value)}
					className={inputClass}
				/>
			</Field>
			{error && <ErrorNotice>保存できませんでした: {errorText(error)}</ErrorNotice>}
			<div className="flex gap-2">
				<button type="submit" disabled={saving || !name.trim()} className={`${btnPrimary} flex-1`}>
					{saving ? "保存中…" : "保存"}
				</button>
				{course && !confirming && (
					<button type="button" className={btnDanger} onClick={() => setConfirming(true)}>
						この科目を削除
					</button>
				)}
			</div>
			{course && confirming && (
				<div className="flex flex-col gap-2">
					<p>「{course.name}」を削除します。この科目のタスクは科目なしになります。</p>
					<div className="grid grid-cols-2 gap-2">
						<button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>
							キャンセル
						</button>
						<button
							type="button"
							className={btnDanger}
							disabled={saving}
							onClick={() => remove.mutate(course.id, { onSuccess: onDone })}
						>
							削除する
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
						＋ 科目を追加
					</button>
				}
			>
				科目
			</SectionTitle>
			{courses.isError && <ErrorNotice>科目を読み込めませんでした</ErrorNotice>}
			{courses.data?.length === 0 && <p className="py-2 text-xs text-faint">まだ科目がありません</p>}
			<ul className={listClass}>
				{courses.data?.map((c) => (
					<li key={c.id}>
						<button
							type="button"
							onClick={() => setEditing(c)}
							className="flex w-full items-baseline gap-2 py-2 text-left active:bg-wash"
						>
							<span className="shrink-0 font-medium">{c.name}</span>
							<span className="min-w-0 flex-1 truncate text-xs text-sub">
								{c.aliases.length > 0 && `別名: ${c.aliases.join("、")}`}
							</span>
							<span aria-hidden="true" className="text-faint">
								›
							</span>
						</button>
					</li>
				))}
			</ul>
			{editing && (
				<Sheet title={editing === "new" ? "科目を追加" : "科目を編集"} onClose={close}>
					<CourseForm course={editing === "new" ? undefined : editing} onDone={close} />
				</Sheet>
			)}
		</section>
	);
}
