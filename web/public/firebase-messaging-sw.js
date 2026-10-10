// FCM の Service Worker。通知の表示とタップ時の遷移だけを担当する。
//
// 重要: この Service Worker は何もキャッシュしない。fetch ハンドラを追加しないこと。
// Cloudflare Access の裏にあるため、ナビゲーション・/api・/cdn-cgi/* は常にネットワークへ直接出す必要がある
// (キャッシュ優先にすると Access のログインへのリダイレクトが隠れる。plan.md §4.3)。
//
// Firebase の設定は URL のクエリで受け取る(web/src/push/index.ts が組み立てて register する)。
// こうすると設定の置き場が web/src/push/firebase-config.ts の1か所だけで済み、ここに値を複製しなくてよい。
// SDK のバージョンは web/package.json の firebase に合わせること。
importScripts(
	"https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js",
	"https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js",
);

const params = new URL(self.location.href).searchParams;
if (params.get("apiKey")) {
	firebase.initializeApp({
		apiKey: params.get("apiKey"),
		projectId: params.get("projectId"),
		messagingSenderId: params.get("messagingSenderId"),
		appId: params.get("appId"),
	});
	// notification 付きのメッセージは、アプリが見えていないとき SDK が自動で表示し、
	// webpush.fcm_options.link へのタップ遷移も SDK が処理する
	firebase.messaging();
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// SDK が処理しない通知(アプリが前面のときにページから出したもの)のタップ。data.url を開く
self.addEventListener("notificationclick", (event) => {
	const url = event.notification.data?.url;
	event.notification.close();
	if (!url) return;
	const target = new URL(url, self.location.origin);
	if (target.origin !== self.location.origin) return;
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
			const client = clients.find((c) => "focus" in c);
			if (client) {
				await client.focus();
				if ("navigate" in client) return client.navigate(target.href);
				return;
			}
			return self.clients.openWindow(target.href);
		}),
	);
});
