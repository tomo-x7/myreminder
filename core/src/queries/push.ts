// 通知の端末登録とテスト送信。Firebase の SDK の onRegistered などのコールバックから呼ぶので、フックではなく関数。
// api は呼び出し側が持つクライアントを渡す
import type { Api } from "../api/client";

export type PushResult = { ok: true } | { ok: false; message: string };

/** 端末(web は FID、Android は FCM の登録トークン)をサーバーに登録する。アプリを開くたびに呼ばれ、サーバー側で last_seen_at が更新される。失敗したら throw する */
export async function uploadPushToken(
	api: Api,
	input: { token: string; label?: string; platform: "web" | "android" },
): Promise<void> {
	const res = await api.api.push.tokens.$post({ json: input }).catch(() => null);
	if (!res) throw new Error("サーバーへの登録に失敗しました(通信エラー)");
	if (!res.ok) throw new Error(`サーバーへの登録に失敗しました (${res.status})`);
}

/** 端末の登録を消す。失敗は握りつぶす(消えなくても、届かなければサーバーが後で片付ける) */
export async function deletePushToken(api: Api, token: string): Promise<void> {
	await api.api.push.tokens[":token"].$delete({ param: { token } }).catch(() => {});
}

/** テスト通知を送って、宛先ごとの結果を人向けの文にする */
export async function sendTestPush(api: Api): Promise<PushResult> {
	try {
		const res = await api.api.push.test.$post({ json: {} });
		if (!res.ok) return { ok: false, message: `送信に失敗しました (${res.status})` };
		const data = await res.json();
		if (!data.configured) return { ok: false, message: "サーバーに FCM_SERVICE_ACCOUNT が未設定です" };
		if (data.results.length === 0) return { ok: false, message: "登録された端末がありません" };
		return data.ok
			? { ok: true }
			: { ok: false, message: `届きませんでした: ${data.results.map((r) => r.code ?? "ok").join(", ")}` };
	} catch (e) {
		return { ok: false, message: e instanceof Error ? e.message : "送信に失敗しました" };
	}
}
