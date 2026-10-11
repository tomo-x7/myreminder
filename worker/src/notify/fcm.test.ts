import { describe, expect, it } from "vitest";
import { buildFcmMessage, type PushMessage } from "./fcm";

const ORIGIN = "https://reminder.tomo-x.win";
const FID = "cH3x9Qf2TqSl0aB7dE5gHi"; // web SDK の FID(22文字)
const NATIVE_TOKEN = `fXyZ12abCDe:APA91b${"x".repeat(140)}`; // Android の登録トークン(":" を含み長い)

const message = (over: Partial<PushMessage> = {}): PushMessage => ({
	title: "そろそろ始めよう",
	body: "レポートを始める時間",
	url: "/tasks/abc?from=push",
	notificationId: "n1",
	urgency: "normal",
	ttlSec: 3600,
	...over,
});

describe("buildFcmMessage", () => {
	it("宛先: web の FID は fid、ネイティブの登録トークンは token", () => {
		const web = buildFcmMessage(FID, message(), ORIGIN);
		expect(web).toMatchObject({ fid: FID });
		expect(web).not.toHaveProperty("token");

		const android = buildFcmMessage(NATIVE_TOKEN, message(), ORIGIN);
		expect(android).toMatchObject({ token: NATIVE_TOKEN });
		expect(android).not.toHaveProperty("fid");
	});

	it("data は url と notificationId のみで、値はすべて文字列", () => {
		const m = buildFcmMessage(NATIVE_TOKEN, message(), ORIGIN);
		expect(m.data).toEqual({ url: "/tasks/abc?from=push", notificationId: "n1" });
		expect(Object.values(m.data).every((v) => typeof v === "string")).toBe(true);
	});

	it("webpush は従来どおり(Urgency・TTL・絶対 URL の link・tag)", () => {
		const m = buildFcmMessage(FID, message({ urgency: "high", ttlSec: 10800 }), ORIGIN);
		expect(m.webpush).toEqual({
			headers: { Urgency: "high", TTL: "10800" },
			notification: { icon: "/icons/icon-192.png", tag: "n1" },
			fcm_options: { link: "https://reminder.tomo-x.win/tasks/abc?from=push" },
		});
	});

	it("致命(urgency high)は priority HIGH・critical チャンネル", () => {
		const { android } = buildFcmMessage(NATIVE_TOKEN, message({ urgency: "high", ttlSec: 3 * 3600 }), ORIGIN);
		expect(android).toEqual({
			priority: "HIGH",
			ttl: "10800s",
			notification: { channel_id: "critical", tag: "n1" },
		});
	});

	it("それ以外は priority NORMAL・default チャンネル", () => {
		const { android } = buildFcmMessage(NATIVE_TOKEN, message(), ORIGIN);
		expect(android).toEqual({
			priority: "NORMAL",
			ttl: "3600s",
			notification: { channel_id: "default", tag: "n1" },
		});
	});

	it("ttl は整数の秒にそろえる(小数・負は丸める)", () => {
		expect(buildFcmMessage(FID, message({ ttlSec: 90.7 }), ORIGIN).android.ttl).toBe("90s");
		expect(buildFcmMessage(FID, message({ ttlSec: -5 }), ORIGIN).android.ttl).toBe("0s");
	});

	it("notification の title/body は web・Android 共通", () => {
		expect(buildFcmMessage(FID, message(), ORIGIN).notification).toEqual({
			title: "そろそろ始めよう",
			body: "レポートを始める時間",
		});
	});
});
