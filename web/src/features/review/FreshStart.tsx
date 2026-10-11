import { isJstMonday } from "core/domain/home";
import { useNow } from "core/hooks/use-now";
import { BottleneckLine } from "./BottleneckLine";

/** 今の週への見通し(フレッシュスタート)。月曜は「新しい週」と言う */
export function FreshStart() {
	const now = useNow();
	const monday = isJstMonday(now);
	return (
		<section className="border-l-2 border-ink py-0.5 pl-2">
			<p className="font-semibold">
				{monday ? "新しい週。" : "今週の見通し。"}
				<BottleneckLine now={now} />
			</p>
		</section>
	);
}
