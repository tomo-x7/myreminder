// 手入力のカードの「いつ始める?」の候補(GET /api/schedule/start-suggestions)。AI の解析なしで取れる
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { unwrap } from "../api/errors";
import { queryKeys } from "./keys";

/** enabled が false の間は取りに行かない。失敗しても候補が出ないだけ(登録は止めない) */
export const useStartSuggestions = (enabled = true) => {
	const api = useApi();
	return useQuery({
		queryKey: [...queryKeys.schedule, "start-suggestions"],
		enabled,
		queryFn: async () => unwrap(await api.api.schedule["start-suggestions"].$get()),
	});
};
