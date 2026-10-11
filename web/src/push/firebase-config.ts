// Firebase の Web 設定と VAPID 公開鍵。どちらも公開してよい値なのでコミットする(.env は gitignore のため使わない)。
// 値の取得手順は docs/setup.md の「2. Firebase」。YOUR_ のままだと、通知の有効化は案内メッセージを出して止まる
export const firebaseConfig = {
	apiKey: "AIzaSyARUIesvmKmq8RWnc6VvJnneuChYDC3WFA",
	projectId: "myreminder-adcf4",
	messagingSenderId: "566569148982",
	appId: "1:566569148982:web:02cbfaad63050d227d2e97",
};

/** Firebase コンソール > Project settings > Cloud Messaging > Web Push certificates の公開鍵 */
export const vapidKey = "BL2XKkqKtXYPAxMNOg8zztTaRioKImnYd7MFEvC7KFzmqsKQsRgQBOaL66ciLJ7EvgqIYzzwcb09itfX0UYz3W0";

/** プレースホルダが残っていないか */
export const isFirebaseConfigured = [...Object.values(firebaseConfig), vapidKey].every(
	(v) => v && !v.startsWith("YOUR_"),
);
