import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { BusyBlockInput, BusyBlockPatch } from "../api/types";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";

export const useBusyBlocks = () => {
	const api = useApi();
	return useQuery({
		queryKey: queryKeys.busyBlocks,
		queryFn: async () => unwrap(await api.api["busy-blocks"].$get()),
	});
};

export const useCreateBusyBlock = () => {
	const api = useApi();
	return useInvalidatingMutation(async (json: BusyBlockInput) => {
		await unwrap(await api.api["busy-blocks"].$post({ json }));
	}, queryKeys.busyBlocks);
};

export const useUpdateBusyBlock = () => {
	const api = useApi();
	return useInvalidatingMutation(async ({ id, patch }: { id: string; patch: BusyBlockPatch }) => {
		await unwrap(await api.api["busy-blocks"][":id"].$patch({ param: { id }, json: patch }));
	}, queryKeys.busyBlocks);
};

export const useDeleteBusyBlock = () => {
	const api = useApi();
	return useInvalidatingMutation(async (id: string) => {
		await unwrap(await api.api["busy-blocks"][":id"].$delete({ param: { id } }));
	}, queryKeys.busyBlocks);
};
