// 週次のふりかえり(/api/review)。week は月曜の YYYY-MM-DD、省略すると直近の終わった週
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import { queryKeys } from "./keys";

export const useReview = (week: string | undefined) => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.review, week ?? "latest"],
		queryFn: async () => unwrap(await api.api.review.$get({ query: week ? { week } : {} })),
	});
};
