// 週次のふりかえり(/api/review)のフック。week は月曜の YYYY-MM-DD、省略すると直近の終わった週
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../lib/api";

export type Review = InferResponseType<typeof api.api.review.$get, 200>;
export type ReviewDay = Review["days"][number];

export const useReview = (week: string | undefined) =>
	useQuery({
		queryKey: ["review", week ?? "latest"],
		queryFn: async () => {
			const res = await api.api.review.$get({ query: week ? { week } : {} });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return (await res.json()) as Review;
		},
	});
