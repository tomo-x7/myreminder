// ルート共通の小さな部品
import { eq } from "drizzle-orm";
import * as v from "valibot";
import type { Db } from "../db";
import { courses } from "../db/schema";

/** `/:id` のパスパラメータ */
export const idParamSchema = v.object({ id: v.pipe(v.string(), v.minLength(1)) });

/** 404 のときの本文 */
export const NOT_FOUND = { error: "not_found" } as const;

/** 科目 id が存在しないときの 400 の本文 */
export const INVALID_COURSE = { error: "invalid_course" } as const;

export const courseExists = async (db: Db, courseId: string): Promise<boolean> =>
	(await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId))).length > 0;
