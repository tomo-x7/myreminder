// Firebase の Web 設定と VAPID 公開鍵。どちらも公開してよい値なのでコミットする(.env は gitignore のため使わない)。
// 値の取得手順は docs/setup.md の「2. Firebase」。YOUR_ のままだと、通知の有効化は案内メッセージを出して止まる
export const firebaseConfig = {
	apiKey: "YOUR_API_KEY",
	projectId: "YOUR_PROJECT_ID",
	messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
	appId: "YOUR_APP_ID",
};

/** Firebase コンソール > Project settings > Cloud Messaging > Web Push certificates の公開鍵 */
export const vapidKey = "YOUR_VAPID_PUBLIC_KEY";

/** プレースホルダが残っていないか */
export const isFirebaseConfigured = [...Object.values(firebaseConfig), vapidKey].every(
	(v) => v && !v.startsWith("YOUR_"),
);
