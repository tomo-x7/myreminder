import { bottleneckText } from "core/domain/schedule";
import { useNow } from "core/hooks/use-now";
import { useSchedule } from "core/queries/schedule";

/** 今の週の山場(フレッシュスタート。plan.md §2.2-9)。山場がないとき・取れないときは何も出さない */
export function FreshStart() {
	const now = useNow();
	const bottleneck = useSchedule().data?.bottleneck;
	if (!bottleneck) return null;
	return (
		<section className="border-l-2 border-ink py-0.5 pl-2">
			<p className="font-semibold">
				<span className="mr-1.5 text-xs font-normal text-sub">山場</span>
				{bottleneckText(bottleneck, now)}
			</p>
		</section>
	);
}
