// ルート共通の小さな部品
import * as v from "valibot";

/** `/:id` のパスパラメータ */
export const idParamSchema = v.object({ id: v.pipe(v.string(), v.minLength(1)) });

/** 404 のときの本文 */
export const NOT_FOUND = { error: "not_found" } as const;
