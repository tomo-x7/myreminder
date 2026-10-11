import { Hono } from "hono";
import type { Env } from "../env";

/**
 * API の互換性の版。項目を消す・意味を変える・必須にするときだけ上げる(足すだけなら上げない)。
 * アプリは起動時に見て、自分の知っている版より新しければ更新を促す。規則は ai-docs/specs/client.md の「互換性」
 */
export const API_VERSION = 1;

export const health = new Hono<Env>().get("/", (c) => c.json({ ok: true, now: Date.now(), apiVersion: API_VERSION }));
