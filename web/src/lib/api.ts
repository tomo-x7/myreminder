import { hc } from "hono/client";
import type { AppType } from "worker";

const RELOAD_GUARD_KEY = "session:reloadedAt";

/** Cloudflare Access のセッション切れでログインへ飛ばすために再読み込みする。連続ループは 10 秒の間隔で防ぐ(plan.md §4.3) */
function reloadForLogin() {
	try {
		const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY));
		if (Date.now() - last < 10_000) return;
		sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
	} catch {}
	location.reload();
}

/**
 * /api への fetch。302 はそのまま追わず(Access のログインは別オリジンで CORS で失敗するため)、
 * 302/401/403 を「セッション切れ」とみなして再読み込みする
 */
const sessionAwareFetch: typeof fetch = async (input, init) => {
	const res = await fetch(input, { ...init, redirect: "manual" });
	if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403) reloadForLogin();
	return res;
};

// AppType は basePath("/api") を含むので、origin だけを渡す。dev では Vite の proxy が /api を worker に流す
export const api = hc<AppType>(location.origin, { fetch: sessionAwareFetch });
