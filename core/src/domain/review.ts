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

/** 比率の傾向を、評価をつけずに言う: `見積もりの 1.4 倍かかる傾向` */
export function ratioText(ratio: number): string {
	const r = (Math.round(ratio * 10) / 10).toFixed(1);
	if (ratio >= 1.05) return `見積もりの ${r} 倍かかる傾向`;
	if (ratio <= 0.95) return `見積もりの ${r} 倍で終わる傾向`;
	return "見積もりどおりに終わる傾向";
}
