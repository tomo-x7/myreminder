// FCM HTTP v1 での送信。サービスアカウントの JWT(RS256)は WebCrypto で自前署名する(依存を増やさないため)。
// OAuth アクセストークン(約1h)はモジュールスコープと settings テーブルにキャッシュし、期限の5分前まで使い回す
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { pushTokens, settings } from "../db/schema";
import type { Bindings } from "../env";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const ACCESS_TOKEN_KEY = "fcm_access_token";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

export const DEFAULT_APP_ORIGIN = "https://reminder.tomo-x.win";

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };
type CachedToken = { token: string; expiresAt: number };

export type PushMessage = {
	title: string;
	body: string;
	/** タップで開くパス(例 "/tasks/xxx")。origin は付けない */
	url: string;
	notificationId: string;
	/** "high" は致命の通知。Android の Doze 中でも届けるよう要求する */
	urgency: "high" | "normal";
	/** 配信できないときに FCM が保持する秒数 */
	ttlSec: number;
};

export type SendResult =
	| { ok: true }
	| { ok: false; reason: "not_configured" }
	| {
			ok: false;
			reason: "error";
			status: number;
			code: string;
			message: string;
			/** 登録が無効だと判断して push_tokens から消した */
			removed: boolean;
			/** 一時的な失敗(再送する価値がある) */
			transient: boolean;
	  };

let memoryToken: CachedToken | undefined;
let warnedNotConfigured = false;

function parseServiceAccount(env: Bindings): ServiceAccount | undefined {
	const raw = env.FCM_SERVICE_ACCOUNT?.trim();
	if (!raw) return undefined;
	try {
		const sa = JSON.parse(raw) as Partial<ServiceAccount>;
		if (sa.project_id && sa.client_email && sa.private_key) return sa as ServiceAccount;
	} catch {}
	console.error("FCM_SERVICE_ACCOUNT is not a valid service account JSON");
	return undefined;
}

/** FCM を使える設定か(secret が入っているか) */
export function isFcmConfigured(env: Bindings): boolean {
	return parseServiceAccount(env) !== undefined;
}

const b64url = (data: ArrayBuffer | string) => {
	const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

async function signJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
	const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
	const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
	const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
		"sign",
	]);
	const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
		JSON.stringify({
			iss: sa.client_email,
			scope: SCOPE,
			aud: sa.token_uri ?? DEFAULT_TOKEN_URI,
			iat: nowSec,
			exp: nowSec + 3600,
		}),
	)}`;
	const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
	return `${unsigned}.${b64url(sig)}`;
}

const isFresh = (t: CachedToken | undefined, now: number): t is CachedToken =>
	!!t && typeof t.token === "string" && t.expiresAt - REFRESH_MARGIN_MS > now;

/** アクセストークンを返す。メモリ → D1 → 新規発行の順 */
async function getAccessToken(env: Bindings, sa: ServiceAccount, now: number): Promise<string> {
	if (isFresh(memoryToken, now)) return memoryToken.token;

	const db = getDb(env);
	const [row] = await db.select().from(settings).where(eq(settings.key, ACCESS_TOKEN_KEY));
	const stored = row?.value as CachedToken | undefined;
	if (isFresh(stored, now)) {
		memoryToken = stored;
		return stored.token;
	}

	const res = await fetch(sa.token_uri ?? DEFAULT_TOKEN_URI, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion: await signJwt(sa, Math.floor(now / 1000)),
		}),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`oauth token request failed: ${res.status} ${await res.text()}`);
	const json = (await res.json()) as { access_token: string; expires_in?: number };
	const fresh: CachedToken = { token: json.access_token, expiresAt: now + (json.expires_in ?? 3600) * 1000 };
	memoryToken = fresh;
	await db
		.insert(settings)
		.values({ key: ACCESS_TOKEN_KEY, value: fresh })
		.onConflictDoUpdate({ target: settings.key, set: { value: fresh } });
	return fresh.token;
}

async function invalidateAccessToken(env: Bindings) {
	memoryToken = undefined;
	await getDb(env).delete(settings).where(eq(settings.key, ACCESS_TOKEN_KEY));
}

/** FID(新しい web SDK の register())は22文字ほどの URL-safe 文字列。旧式の登録トークンは長くて ":" を含む */
const looksLikeFid = (token: string) => token.length <= 40 && !token.includes(":");

type FcmError = {
	error?: {
		status?: string;
		message?: string;
		details?: { errorCode?: string; fieldViolations?: { field?: string }[] }[];
	};
};

/** この失敗が「宛先の登録が無効」を意味するか */
function isDeadRegistration(status: number, code: string, err: FcmError["error"]): boolean {
	if (status === 404 || code === "UNREGISTERED") return true;
	if (status !== 400 && code !== "INVALID_ARGUMENT") return false;
	// INVALID_ARGUMENT はメッセージの不備でも出るので、宛先が原因のときだけ消す
	const fields = (err?.details ?? []).flatMap((d) => d.fieldViolations ?? []).map((f) => f.field ?? "");
	return fields.some((f) => /\.(token|fid)$/.test(f)) || /registration|token|fid/i.test(err?.message ?? "");
}

/** 1つの宛先(FID またはトークン)に送る。無効な宛先は push_tokens から消す */
export async function sendToToken(
	env: Bindings,
	token: string,
	message: PushMessage,
	now = Date.now(),
): Promise<SendResult> {
	const sa = parseServiceAccount(env);
	if (!sa) {
		if (!warnedNotConfigured) {
			warnedNotConfigured = true;
			console.warn("FCM_SERVICE_ACCOUNT is not set; push notifications are disabled");
		}
		return { ok: false, reason: "not_configured" };
	}

	const link = new URL(message.url, env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN).toString();
	const body = JSON.stringify({
		message: {
			...(looksLikeFid(token) ? { fid: token } : { token }),
			notification: { title: message.title, body: message.body },
			// data は値が文字列のみ
			data: { url: message.url, notificationId: message.notificationId },
			webpush: {
				headers: { Urgency: message.urgency, TTL: String(message.ttlSec) },
				notification: { icon: "/icons/icon-192.png", tag: message.notificationId },
				fcm_options: { link },
			},
		},
	});

	const post = async () =>
		fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${await getAccessToken(env, sa, now)}`,
				"content-type": "application/json",
			},
			body,
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

	try {
		let res = await post();
		if (res.status === 401) {
			// キャッシュしたトークンが失効していた
			await invalidateAccessToken(env);
			res = await post();
		}
		if (res.ok) return { ok: true };

		const err = ((await res.json().catch(() => ({}))) as FcmError).error;
		const code = err?.details?.find((d) => d.errorCode)?.errorCode ?? err?.status ?? String(res.status);
		const removed = isDeadRegistration(res.status, code, err);
		if (removed) await getDb(env).delete(pushTokens).where(eq(pushTokens.token, token));
		else console.error(`FCM send failed: ${res.status} ${code} ${err?.message ?? ""}`);
		return {
			ok: false,
			reason: "error",
			status: res.status,
			code,
			message: err?.message ?? "",
			removed,
			transient: res.status === 429 || res.status >= 500,
		};
	} catch (e) {
		// ネットワーク・タイムアウト・トークン発行の失敗
		console.error("FCM send threw", e);
		return {
			ok: false,
			reason: "error",
			status: 0,
			code: "EXCEPTION",
			message: e instanceof Error ? e.message : String(e),
			removed: false,
			transient: true,
		};
	}
}
