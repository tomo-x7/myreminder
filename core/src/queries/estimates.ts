import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { Category } from "../domain/draft-types";
import { queryKeys } from "./keys";

/** 見積もりの欄の下に出す「実績」。courseId・seriesId が null のときはクエリに入れない */
export const useEstimateReference = (key: { category: Category; courseId: string | null; seriesId: string | null }) => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.estimateReference, key.category, key.courseId, key.seriesId],
		queryFn: async () =>
			unwrap(
				await api.api.estimates.reference.$get({
					query: {
						category: key.category,
						...(key.courseId !== null ? { courseId: key.courseId } : {}),
						...(key.seriesId !== null ? { seriesId: key.seriesId } : {}),
					},
				}),
			),
	});
};
