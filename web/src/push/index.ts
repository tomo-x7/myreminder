// Web Push の有効化。新しい firebase SDK は getToken ではなく register() + onRegistered() で
// Firebase Installation ID(FID)を受け取る方式。FID は Worker に登録し、HTTP v1 の `fid` で送る。
// Google Cloud 側で FCM Registration API の有効化が必要(docs/setup.md 2-2)
import { deletePushToken, type PushResult, sendTestPush as sendTestPushRequest, uploadPushToken } from "core/queries/push";
import { type FirebaseApp, initializeApp } from "firebase/app";
import {
	getMessaging,
	isSupported,
	type Messaging,
	onMessage,
	onRegistered,
	onUnregistered,
	register,
	unregister,
} from "firebase/messaging";
import { api } from "../platform/api";
import { firebaseConfig, isFirebaseConfigured, vapidKey } from "./firebase-config";

export type PushState = "unsupported" | "unconfigured" | "denied" | "off" | "on";

const ENABLED_KEY = "push:enabled";
const REGISTER_TIMEOUT_MS = 20000;

const getFlag = () => {
	try {
		return localStorage.getItem(ENABLED_KEY) === "1";
	} catch {
		return false;
	}
};
const setFlag = (on: boolean) => {
	try {
		if (on) localStorage.setItem(ENABLED_KEY, "1");
		else localStorage.removeItem(ENABLED_KEY);
	} catch {}
};

/** 今の状態。権限が granted で、この端末で有効化済みなら "on" */
export async function getPushState(): Promise<PushState> {
	if (!("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported().catch(() => false)))
		return "unsupported";
	if (!isFirebaseConfigured) return "unconfigured";
	if (Notification.permission === "denied") return "denied";
	return Notification.permission === "granted" && getFlag() ? "on" : "off";
}

let app: FirebaseApp | undefined;
let messaging: Messaging | undefined;
let currentFid: string | undefined;
let registerWaiter: ((fid: string) => void) | undefined;

const label = () => (/Android/i.test(navigator.userAgent) ? "Android" : navigator.platform || "browser");

const uploadFid = (fid: string) => uploadPushToken(api, { token: fid, label: label() });

/** 初回だけ SDK を初期化し、登録・解除・前面受信のハンドラを付ける */
function setup(): Messaging {
	if (messaging) return messaging;
	app = initializeApp(firebaseConfig);
	messaging = getMessaging(app);

	// register() のたびに(FID の更新・pushsubscriptionchange でも)呼ばれる。
	// registerWithFcm の最中なら呼び出し側が登録を待つ。それ以外(FID の更新)はここで登録し直す
	onRegistered(messaging, (fid) => {
		currentFid = fid;
		if (registerWaiter) registerWaiter(fid);
		else uploadFid(fid).catch((e) => console.error(e));
	});
	onUnregistered(messaging, (fid) => {
		void deletePushToken(api, fid);
	});
	// アプリが前面のときは SDK が自動表示しないので、自分で出す(タップ遷移は Service Worker の data.url)
	onMessage(messaging, (payload) => {
		const reg = navigator.serviceWorker.getRegistration("/");
		const { title, body } = payload.notification ?? {};
		void reg.then((r) =>
			r?.showNotification(title ?? "myreminder", {
				body,
				icon: "/icons/icon-192.png",
				data: { url: payload.data?.url ?? "/" },
			}),
		);
	});
	return messaging;
}

/**
 * Service Worker に Firebase 設定をクエリで渡して登録する。共有メニュー(POST の share_target)も
 * この Service Worker が受けるので、通知の設定に関係なく起動時にも呼ぶ(main.tsx)。同じ URL なら登録し直しにならない
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
	const query = new URLSearchParams({
		apiKey: firebaseConfig.apiKey,
		projectId: firebaseConfig.projectId,
		messagingSenderId: firebaseConfig.messagingSenderId,
		appId: firebaseConfig.appId,
	});
	const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`, { scope: "/" });
	await navigator.serviceWorker.ready;
	return reg;
}

/** FCM に登録し、FID を Worker に登録するところまで待つ。どちらかが失敗したら throw する */
async function registerWithFcm(): Promise<void> {
	const m = setup();
	const reg = await registerServiceWorker();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const fid = new Promise<string>((resolve, reject) => {
		timer = setTimeout(() => reject(new Error("FCM への登録がタイムアウトしました")), REGISTER_TIMEOUT_MS);
		registerWaiter = resolve;
	});
	// register() が先に失敗したとき、あとで reject されても未処理にならないようにする
	fid.catch(() => {});
	try {
		await register(m, { vapidKey, serviceWorkerRegistration: reg });
		await uploadFid(await fid);
	} finally {
		clearTimeout(timer);
		registerWaiter = undefined;
	}
}

/** 通知を有効にする。権限のダイアログを出すので、必ずボタン押下などのユーザー操作から呼ぶ */
export async function enablePush(): Promise<PushResult> {
	const state = await getPushState();
	if (state === "unsupported") return { ok: false, message: "このブラウザはプッシュ通知に対応していません" };
	if (state === "unconfigured")
		return {
			ok: false,
			message: "Firebase の設定が未入力です。web/src/push/firebase-config.ts を埋めてください(docs/setup.md 2)",
		};
	if (state === "denied")
		return { ok: false, message: "通知がブロックされています。ブラウザのサイトの設定で許可してください" };

	try {
		// await の前に権限を求める(ユーザー操作の文脈を保つため)
		if ((await Notification.requestPermission()) !== "granted")
			return { ok: false, message: "通知が許可されませんでした" };
		await registerWithFcm();
		setFlag(true);
		return { ok: true };
	} catch (e) {
		console.error(e);
		return { ok: false, message: e instanceof Error ? e.message : "通知を有効にできませんでした" };
	}
}

/**
 * 有効化済みの端末で、アプリを開くたびに呼ぶ(main.tsx)。FID の更新や登録の期限切れを直し、
 * 前面で届く通知の onMessage も付ける。"on"(権限 granted かつ有効化済み)でなければ何もしないので、権限のダイアログは出ない
 */
export async function syncPush(): Promise<void> {
	if ((await getPushState()) !== "on") return;
	await registerWithFcm().catch((e) => console.error(e));
}

export async function disablePush(): Promise<void> {
	setFlag(false);
	const m = messaging ?? (isFirebaseConfigured ? setup() : undefined);
	if (m) await unregister(m).catch((e) => console.error(e));
	if (currentFid) await deletePushToken(api, currentFid);
}

export const sendTestPush = (): Promise<PushResult> => sendTestPushRequest(api);
