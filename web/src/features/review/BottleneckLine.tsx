import { bottleneckText } from "core/domain/schedule";
import { useSchedule } from "core/queries/schedule";

/** /api/schedule の山場を1行で。読み込み中・取れないときは何も出さない */
export function BottleneckLine({ now }: { now: number }) {
	const schedule = useSchedule();
	if (!schedule.data) return null;
	const { bottleneck } = schedule.data;
	return <>{bottleneck ? bottleneckText(bottleneck, now) : "今のところ山場はありません。"}</>;
}
