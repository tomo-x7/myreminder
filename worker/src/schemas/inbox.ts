// 受信箱 API の入力。タスクを作る accept は taskCreateSchema をそのまま使う
import * as v from "valibot";

export const inboxLinkSchema = v.object({ taskId: v.pipe(v.string(), v.minLength(1)) });
