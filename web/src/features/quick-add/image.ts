// 写真から追加: 送る前にブラウザで縮める(長辺 1280px・JPEG 品質 0.8)。
// スマホのカメラの写真は数 MB あるので、そのままだと worker の上限(1.5MB)を超え、モデルの入力トークンも無駄に増える
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.8;

/** 画像を長辺 MAX_SIDE 以下の JPEG にする。拡大はしない。EXIF の向きは反映する */
export async function resizeImage(file: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
	try {
		const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("canvas を使えません");
		// JPEG は透過がないので、PNG の透明部分が黒くならないよう白で塗ってから描く
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, width, height);
		ctx.drawImage(bitmap, 0, 0, width, height);
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error("画像を変換できませんでした"))),
				"image/jpeg",
				JPEG_QUALITY,
			);
		});
	} finally {
		bitmap.close();
	}
}

// 共有メニューから届いた画像。Service Worker(web/public/firebase-messaging-sw.js)が Cache に入れ、/share?image=1 に飛ばす。
// 名前と URL は Service Worker 側と同じにすること
const SHARE_CACHE = "share-target";
const SHARE_IMAGE_KEY = "/share-target/image";

/** 共有された画像を取り出す(1回だけ。取り出したら消す)。なければ null */
export async function takeSharedImage(): Promise<Blob | null> {
	try {
		if (!("caches" in window)) return null;
		const cache = await caches.open(SHARE_CACHE);
		const res = await cache.match(SHARE_IMAGE_KEY);
		if (!res) return null;
		const blob = await res.blob();
		await cache.delete(SHARE_IMAGE_KEY);
		return blob.size > 0 ? blob : null;
	} catch {
		return null;
	}
}
