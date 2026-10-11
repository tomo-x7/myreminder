import { bottleneckLine } from "core/domain/home";
import { useSchedule } from "core/queries/schedule";

/** /api/schedule の山場を1行で。読み込み中・取れないときは何も出さない */
export function BottleneckLine({ now }: { now: number }) {
	const schedule = useSchedule();
	if (!schedule.data) return null;
	return <>{bottleneckLine(schedule.data.bottleneck, now)}</>;
}
