import { sql } from "drizzle-orm";
import { tasks } from "../db/schema";

/** 同じミリ秒の連続更新でも、状態変更の競合検出に使う時刻を進める。 */
export const nextTaskUpdatedAt = (now: number) => sql<number>`max(${tasks.updatedAt} + 1, ${now})`;
