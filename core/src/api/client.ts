// API クライアント。web・RN で共通。プラットフォーム固有の処理(Access の再読み込み、Service Token のヘッダー)は呼び出し側が渡す
import { hc } from "hono/client";
import type { AppType } from "worker";

export type CreateApiOptions = {
	/** origin だけを渡す(AppType が basePath("/api") を含むため)。web は location.origin */
	baseUrl: string;
	/** 差し替える fetch。省略時はグローバルの fetch。web は redirect:"manual" を付けて渡す */
	fetch?: typeof fetch;
	/** 全リクエストに付けるヘッダー。アプリは Access の Service Token(CF-Access-Client-Id / -Secret) */
	headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
	/** 302(opaqueredirect)/401/403 = Access のセッション切れ・認証の失敗のとき。web は再読み込み、アプリは設定の見直しを促す */
	onAuthError?: () => void;
};

export function createApi({ baseUrl, fetch: baseFetch, headers, onAuthError }: CreateApiOptions) {
	const authAwareFetch: typeof fetch = async (input, init) => {
		const res = await (baseFetch ?? fetch)(input, init);
		if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403) onAuthError?.();
		return res;
	};
	return hc<AppType>(baseUrl, { fetch: authAwareFetch, headers });
}

export type Api = ReturnType<typeof createApi>;
