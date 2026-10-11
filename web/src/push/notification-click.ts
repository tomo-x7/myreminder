// 通知のタップ。アプリがすでに開いているとき、SDK の Service Worker はそのウィンドウを前面に出して
// postMessage するだけで遷移しない(開いていなければ SDK が link を開く)。そのメッセージを受けてアプリ内で遷移する
import { navigate } from "wouter/use-browser-location";

type ClickMessage = {
	isFirebaseMessaging?: boolean;
	messageType?: string;
	data?: { url?: unknown };
	fcmOptions?: { link?: unknown };
};

/** メッセージの遷移先。同じオリジンのパスだけ(外へは飛ばない)。なければ null */
export function clickTarget(msg: ClickMessage, origin = location.origin): string | null {
	if (!msg?.isFirebaseMessaging || msg.messageType !== "notification-clicked") return null;
	const raw = msg.data?.url ?? msg.fcmOptions?.link;
	if (typeof raw !== "string") return null;
	try {
		const url = new URL(raw, origin);
		return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null;
	} catch {
		return null;
	}
}

/** 起動時に一度だけ呼ぶ。SDK が新しく開いたウィンドウにも同じメッセージを送るので、いまの場所と同じなら何もしない */
export function listenNotificationClick(): void {
	if (!("serviceWorker" in navigator)) return;
	navigator.serviceWorker.addEventListener("message", (e: MessageEvent<ClickMessage>) => {
		const target = clickTarget(e.data);
		if (target && target !== `${location.pathname}${location.search}${location.hash}`) navigate(target);
	});
}
