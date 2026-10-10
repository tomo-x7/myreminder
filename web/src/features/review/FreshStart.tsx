import { jstParts } from "../../lib/date";
import { useNow } from "../../lib/use-now";
import { BottleneckLine } from "./BottleneckLine";

/** 今の週への見通し(フレッシュスタート)。月曜は「新しい週」と言う */
export function FreshStart() {
	const now = useNow();
	const monday = jstParts(now).weekday === 1;
	return (
		<section className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3">
			<p className="text-base font-semibold text-blue-950">
				{monday ? "新しい週。" : "今週の見通し。"}
				<BottleneckLine now={now} />
			</p>
		</section>
	);
}
