// 余裕リストの空き時間の選択。選んでいなければ、サーバーの既定(次の空き時間の長さ)
import { useState } from "react";
import { useSlackList } from "../queries/schedule";

export function useSlackView() {
	const [spare, setSpare] = useState<number | undefined>(undefined);
	const list = useSlackList(spare);

	return {
		list,
		/** 選んだ長さ(分)。選んでいなければ undefined */
		spare,
		/** いま見せている長さ(分)。選んでいなければサーバーの既定 */
		shown: spare ?? list.data?.spareMin,
		choose: (min: number) => setSpare(min),
		/** 選びを戻して、次の空きに合わせる */
		reset: () => setSpare(undefined),
	};
}
