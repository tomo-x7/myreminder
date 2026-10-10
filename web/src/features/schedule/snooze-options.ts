// 「いつに回す?」の候補。あいまいな「あとで」は置かず、必ず時刻を選ばせる(plan.md §2.2-4)
import { jstParts, startOfJstDay } from "../../lib/date";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type SnoozeOption = { label: string; at: number };

/** その日(JST)の h 時 */
const at = (dayStart: number, hour: number) => dayStart + hour * HOUR;

export function snoozeOptions(now: number): SnoozeOption[] {
	const today = startOfJstDay(now);
	const tomorrow = today + DAY;
	const out: SnoozeOption[] = [];
	if (at(today, 21) > now + 30 * 60_000) out.push({ label: "今夜 21:00", at: at(today, 21) });
	out.push({ label: "明日の夕方 17:00", at: at(tomorrow, 17) });
	out.push({ label: "明日の夜 21:00", at: at(tomorrow, 21) });
	// 週末: 次に来る土日の 10:00(1時間以上先)
	for (let d = 0; d <= 7; d++) {
		const day = today + d * DAY;
		const wd = jstParts(day).weekday;
		if ((wd === 6 || wd === 0) && at(day, 10) > now + HOUR) {
			out.push({ label: wd === 6 ? "土曜 10:00" : "日曜 10:00", at: at(day, 10) });
			break;
		}
	}
	return out;
}
