// web の API クライアント。Cloudflare Access の cookie が認証なので、ここで Access の挙動(302・セッション切れ)だけ面倒を見る
import { createApi } from "core/api/client";

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
 * 302 はそのまま追わず(Access のログインは別オリジンで CORS で失敗するため)、
 * core が 302/401/403 を「セッション切れ」とみなして onAuthError を呼ぶ
 */
const manualRedirectFetch: typeof fetch = (input, init) => fetch(input, { ...init, redirect: "manual" });

// dev では Vite の proxy が /api を worker に流す
export const api = createApi({
	baseUrl: location.origin,
	fetch: manualRedirectFetch,
	onAuthError: reloadForLogin,
});
