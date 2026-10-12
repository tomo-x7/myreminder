import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { BusyBlockInput, BusyBlockPatch } from "../api/types";
import { queryKeys } from "./keys";
import { chunks, useInvalidatingMutation } from "./mutation";

export const useBusyBlocks = () => {
	const api = useApi();
	return useQuery({
		queryKey: queryKeys.busyBlocks,
		queryFn: async () => unwrap(await api.api["busy-blocks"].$get()),
	});
};

// 授業を入れると同じ名前の科目が作られるので、科目も取り直す
export const useCreateBusyBlock = () => {
	const api = useApi();
	return useInvalidatingMutation(
		async (json: BusyBlockInput) => {
			await unwrap(await api.api["busy-blocks"].$post({ json }));
		},
		queryKeys.busyBlocks,
		[queryKeys.courses],
	);
};

export const useUpdateBusyBlock = () => {
	const api = useApi();
	return useInvalidatingMutation(
		async ({ id, patch }: { id: string; patch: BusyBlockPatch }) => {
			await unwrap(await api.api["busy-blocks"][":id"].$patch({ param: { id }, json: patch }));
		},
		queryKeys.busyBlocks,
		[queryKeys.courses],
	);
};

export const useDeleteBusyBlock = () => {
	const api = useApi();
	return useInvalidatingMutation(async (id: string) => {
		await unwrap(await api.api["busy-blocks"][":id"].$delete({ param: { id } }));
	}, queryKeys.busyBlocks);
};

/** まとめて削除。API の上限(100件)ごとに分けて送る */
export const useDeleteBusyBlocks = () => {
	const api = useApi();
	return useInvalidatingMutation(async (ids: readonly string[]) => {
		for (const chunk of chunks(ids, 100)) {
			await unwrap(await api.api["busy-blocks"]["bulk-delete"].$post({ json: { ids: [...chunk] } }));
		}
	}, queryKeys.busyBlocks);
};
