import { useSchedule } from "../schedule";
import { bottleneckText } from "../schedule/format";

/** /api/schedule の山場を1行で。読み込み中・取れないときは何も出さない */
export function BottleneckLine({ now }: { now: number }) {
	const schedule = useSchedule();
	if (!schedule.data) return null;
	const { bottleneck } = schedule.data;
	return <>{bottleneck ? bottleneckText(bottleneck, now) : "今のところ山場はありません。"}</>;
}
