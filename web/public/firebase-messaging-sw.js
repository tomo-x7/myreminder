// FCM の Service Worker。通知の表示とタップ時の遷移だけを担当する。
//
// 重要: この Service Worker は何もキャッシュしない。fetch ハンドラは Web Share Target の POST /share だけを受ける
// (下の share-target)。それ以外には respondWith を呼ばない。
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

// --- share-target ---
// manifest の share_target は POST(multipart/form-data)。共有された画像は Cache に1枚だけ入れて /share?image=1 へ、
// テキストだけなら従来の GET の形(/share?title=&text=&url=)に直して飛ばす。どちらもネットワークには出ない。
// Cache の名前と URL は web/src/features/quick-add/image.ts と同じにすること。
const SHARE_CACHE = "share-target";
const SHARE_IMAGE_KEY = "/share-target/image";

async function handleShare(request) {
	const to = (search) => Response.redirect(new URL(`/share${search}`, self.location.origin).href, 303);
	try {
		const form = await request.formData();
		const file = form.get("image");
		if (file && typeof file === "object" && "size" in file && file.size > 0) {
			const cache = await caches.open(SHARE_CACHE);
			await cache.put(
				SHARE_IMAGE_KEY,
				new Response(file, { headers: { "content-type": file.type || "image/jpeg" } }),
			);
			return to("?image=1");
		}
		const query = new URLSearchParams();
		for (const key of ["title", "text", "url"]) {
			const value = form.get(key);
			if (typeof value === "string" && value) query.set(key, value);
		}
		return to(query.size > 0 ? `?${query}` : "");
	} catch {
		return to("");
	}
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "POST") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin || url.pathname !== "/share") return;
	event.respondWith(handleShare(request));
});
