import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import type { SettingsPatch } from "../api/types";
import { queryKeys } from "./keys";

export const useSettings = () => {
	const api = useApi();
	return useQuery({
		queryKey: queryKeys.settings,
		queryFn: async () => unwrap(await api.api.settings.$get()),
	});
};

export const useUpdateSettings = () => {
	const api = useApi();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (json: SettingsPatch) => unwrap(await api.api.settings.$patch({ json })),
		onSuccess: (data) => {
			qc.setQueryData(queryKeys.settings, data);
			void qc.invalidateQueries({ queryKey: queryKeys.schedule });
		},
	});
};
