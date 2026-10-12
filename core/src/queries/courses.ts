import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { CourseInput } from "../api/types";
import { queryKeys } from "./keys";
import { chunks, useInvalidatingMutation } from "./mutation";

export const useCourses = () => {
	const api = useApi();
	return useQuery({
		queryKey: queryKeys.courses,
		queryFn: async () => unwrap(await api.api.courses.$get()),
	});
};

export const useCreateCourse = () => {
	const api = useApi();
	return useInvalidatingMutation(async (json: CourseInput) => {
		await unwrap(await api.api.courses.$post({ json }));
	}, queryKeys.courses);
};

export const useUpdateCourse = () => {
	const api = useApi();
	return useInvalidatingMutation(async ({ id, patch }: { id: string; patch: Partial<CourseInput> }) => {
		await unwrap(await api.api.courses[":id"].$patch({ param: { id }, json: patch }));
	}, queryKeys.courses);
};

// 科目を消すと、タスクと繰り返し(シリーズ)の courseId が null になるので、それらも取り直す
const invalidateAfterCourseDelete = (qc: QueryClient) =>
	Promise.all([
		qc.invalidateQueries({ queryKey: queryKeys.courses }),
		qc.invalidateQueries({ queryKey: queryKeys.tasks }),
		qc.invalidateQueries({ queryKey: queryKeys.series }),
		qc.invalidateQueries({ queryKey: queryKeys.schedule }),
	]);

/** 科目を消すと、タスクの courseId が null になるのでタスクも更新する */
export function useDeleteCourse() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			await unwrap(await api.api.courses[":id"].$delete({ param: { id } }));
		},
		onSuccess: () => invalidateAfterCourseDelete(qc),
	});
}

/** まとめて削除。API の上限(100件)ごとに分けて送る */
export function useDeleteCourses() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (ids: readonly string[]) => {
			for (const chunk of chunks(ids, 100)) {
				await unwrap(await api.api.courses["bulk-delete"].$post({ json: { ids: [...chunk] } }));
			}
		},
		onSuccess: () => invalidateAfterCourseDelete(qc),
	});
}
