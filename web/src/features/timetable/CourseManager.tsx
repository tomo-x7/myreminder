import { useState } from "react";
import { Sheet } from "../../components/Sheet";
import { btnDanger, btnPrimary, btnSecondary, ErrorNotice, Field, inputClass, SectionTitle } from "../../components/ui";
import { type Course, useCourses, useCreateCourse, useDeleteCourse, useUpdateCourse } from "../../lib/queries";

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
			className="flex flex-col gap-4"
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
			{error && <ErrorNotice>保存できませんでした: {error.message}</ErrorNotice>}
			<button type="submit" disabled={saving || !name.trim()} className={btnPrimary}>
				{saving ? "保存中…" : "保存"}
			</button>
			{course &&
				(confirming ? (
					<div className="flex flex-col gap-2">
						<p className="text-sm text-gray-900">
							「{course.name}」を削除します。この科目のタスクは科目なしになります。
						</p>
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
				) : (
					<button
						type="button"
						className="self-start px-1 py-2 text-sm font-medium text-red-600"
						onClick={() => setConfirming(true)}
					>
						この科目を削除
					</button>
				))}
		</form>
	);
}

/** 科目の一覧と追加・名前/別名の編集・削除 */
export function CourseManager() {
	const courses = useCourses();
	const [editing, setEditing] = useState<Course | "new" | null>(null);
	const close = () => setEditing(null);

	return (
		<section className="flex flex-col gap-2">
			<SectionTitle
				action={
					<button
						type="button"
						onClick={() => setEditing("new")}
						className="px-2 py-1 text-sm font-bold text-blue-700"
					>
						＋ 科目を追加
					</button>
				}
			>
				科目
			</SectionTitle>
			{courses.isError && <ErrorNotice>科目を読み込めませんでした</ErrorNotice>}
			{courses.data?.length === 0 && <p className="text-sm text-gray-500">まだ科目がありません</p>}
			<ul className="flex flex-col gap-2">
				{courses.data?.map((c) => (
					<li key={c.id}>
						<button
							type="button"
							onClick={() => setEditing(c)}
							className="flex w-full flex-col items-start rounded-lg border border-gray-300 bg-white px-3 py-2 text-left"
						>
							<span className="text-base font-semibold text-gray-900">{c.name}</span>
							{c.aliases.length > 0 && (
								<span className="text-xs text-gray-500">別名: {c.aliases.join("、")}</span>
							)}
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
