// 時間割の授業から科目を作る(仕様: ai-docs/decisions.md #38)。既存の科目は消さない・変えない

import { normalizeName } from "../ai/courses";
import type { Db } from "../db";
import { courses } from "../db/schema";

/** 授業の名前と同じ科目(名前か別名)がなければ、その名前で科目を作る */
export async function ensureCourse(db: Db, name: string): Promise<void> {
	const trimmed = name.trim();
	if (!trimmed) return;
	// 記号だけの名前は比べられないので作らない
	const key = normalizeName(trimmed);
	if (!key) return;

	const rows = await db.select({ name: courses.name, aliases: courses.aliases }).from(courses);
	if (rows.some((c) => [c.name, ...c.aliases].some((n) => normalizeName(n) === key))) return;

	await db.insert(courses).values({ name: trimmed });
}
