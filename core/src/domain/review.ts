// ふりかえりの表示用の関数

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** `YYYY-MM-DD` → 月・日・曜日(曜日は日付だけから決まる) */
export function dateKeyParts(key: string): { month: number; day: number; weekday: string } {
	const d = new Date(`${key}T00:00:00Z`);
	return { month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: WEEKDAYS[d.getUTCDay()] as string };
}

/** `10/5` */
export function shortDate(key: string): string {
	const { month, day } = dateKeyParts(key);
	return `${month}/${day}`;
}

/** 月曜の日付から `10/5(月)〜10/11(日)` */
export function weekLabel(monday: string): string {
	const start = new Date(`${monday}T00:00:00Z`);
	const end = new Date(start.getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
	return `${shortDate(monday)}(月)〜${shortDate(end)}(日)`;
}

/** 実績/見積もりの比率を、評価をつけずに言う: `実績/見積もり 1.4倍(中央値)` */
export function ratioText(ratio: number): string {
	return `実績/見積もり ${(Math.round(ratio * 10) / 10).toFixed(1)}倍(中央値)`;
}
