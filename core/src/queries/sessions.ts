// 作業記録
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { SessionCreate, SessionPatch } from "../api/types";
import { queryKeys } from "./keys";
import { invalidateWorkLog } from "./mutation";

export const useReviewSessions = () => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.sessions, "review"],
		queryFn: async () => unwrap(await api.api.sessions.review.$get()),
	});
};

export const useSessions = (from: number, to: number) => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.sessions, "list", from, to],
		queryFn: async () => unwrap(await api.api.sessions.$get({ query: { from: String(from), to: String(to) } })),
	});
};

export function useUpdateSession() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (v: { id: string; patch: SessionPatch }) =>
			unwrap(await api.api.sessions[":id"].$patch({ param: { id: v.id }, json: v.patch })),
		onSuccess: () => invalidateWorkLog(qc),
	});
}

export function useCreateSession() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (json: SessionCreate) => unwrap(await api.api.sessions.$post({ json })),
		onSuccess: () => invalidateWorkLog(qc),
	});
}

export function useDeleteSession() {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => unwrap(await api.api.sessions[":id"].$delete({ param: { id } })),
		onSuccess: () => invalidateWorkLog(qc),
	});
}
