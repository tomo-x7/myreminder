// 科目の追加・編集フォーム。別名は打ったままの文字列で持つ
import { useState } from "react";
import type { Course, CourseInput } from "../api/types";
import { errorText } from "../domain/errors";
import { useCreateCourse, useDeleteCourse, useUpdateCourse } from "../queries/courses";
import { isValid, type Problems } from "./common";

export type CourseForm = {
	name: string;
	/** `a, b、c` のようにカンマ区切りで打つ */
	aliases: string;
};

export type CourseFormProblems = Problems<"name">;

/** `a, b、c` → ["a","b","c"] */
export const parseAliases = (s: string) =>
	s
		.split(/[,、，\n]/)
		.map((a) => a.trim())
		.filter(Boolean);

export const emptyCourseForm = (): CourseForm => ({ name: "", aliases: "" });

export const courseToForm = (c: Course): CourseForm => ({ name: c.name, aliases: c.aliases.join(", ") });

export function validateCourseForm(f: CourseForm): CourseFormProblems {
	return f.name.trim() ? {} : { name: "科目名が未入力" };
}

/** 検証済みの入力 → 保存内容 */
export const toCourseInput = (f: CourseForm): CourseInput => ({
	name: f.name.trim(),
	aliases: parseAliases(f.aliases),
});

/** 一覧の行の補足。別名がなければ null */
export const aliasesText = (c: Pick<Course, "aliases">): string | null =>
	c.aliases.length > 0 ? `別名: ${c.aliases.join("、")}` : null;

/** 科目の追加(course なし)・編集のフォームの状態と、保存・削除。終わったら onDone */
export function useCourseForm(course: Course | undefined, onDone: () => void) {
	const create = useCreateCourse();
	const update = useUpdateCourse();
	const remove = useDeleteCourse();
	const [form, setForm] = useState<CourseForm>(() => (course ? courseToForm(course) : emptyCourseForm()));
	const error = create.error ?? update.error ?? remove.error;
	const canSave = isValid(validateCourseForm(form));

	return {
		form,
		set: <K extends keyof CourseForm>(key: K, value: CourseForm[K]) => setForm((f) => ({ ...f, [key]: value })),
		canSave,
		saving: create.isPending || update.isPending || remove.isPending,
		error: error ? errorText(error) : null,
		save() {
			if (!canSave) return;
			const json = toCourseInput(form);
			if (course) update.mutate({ id: course.id, patch: json }, { onSuccess: onDone });
			else create.mutate(json, { onSuccess: onDone });
		},
		/** 新規のときは何もしない */
		remove() {
			if (course) remove.mutate(course.id, { onSuccess: onDone });
		},
	};
}
