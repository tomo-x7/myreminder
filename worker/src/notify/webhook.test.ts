import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { isValidWebhookUrl, maskWebhookUrl, webhookCreateSchema } from "../schemas/webhook";
import { buildWebhookBody, formatDailySummary, formatDuration, formatSubmitted, truncateText } from "./webhook";

const DISCORD = "https://discord.com/api/webhooks/123456789012345678/AbCdEf-gh_IjKlMn";
const SLACK = "https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXX";

describe("formatDuration", () => {
	it("時間と分、片方だけ、四捨五入", () => {
		expect(formatDuration(130)).toBe("2h10m");
		expect(formatDuration(45)).toBe("45m");
		expect(formatDuration(120)).toBe("2h");
		expect(formatDuration(0)).toBe("0m");
		expect(formatDuration(59.6)).toBe("1h");
		expect(formatDuration(-5)).toBe("0m");
	});
});

describe("formatSubmitted", () => {
	it("科目名・作業時間・見積もりを並べる", () => {
		expect(formatSubmitted({ title: "レポート", courseName: "情報倫理" }, 130, 90)).toBe(
			"✅ 情報倫理 レポート 提出(作業 2h10m / 見積もり 1h30m)",
		);
	});
	it("作業記録がなければ作業の部分を省く。科目がなければタイトルだけ", () => {
		expect(formatSubmitted({ title: "レポート" }, null, 90)).toBe("✅ レポート 提出(見積もり 1h30m)");
		expect(formatSubmitted({ title: "レポート" }, 0, 90)).toBe("✅ レポート 提出(見積もり 1h30m)");
	});
});

describe("formatDailySummary", () => {
	const rows = [
		{ title: "演習", courseName: "線形代数", minutes: 80 },
		{ title: "レポート", courseName: "情報倫理", minutes: 120 },
	];
	it("合計と内訳(長い順)", () => {
		expect(formatDailySummary(rows, false)).toBe(
			"今日の課題時間 3h20m — 情報倫理 レポート 2h / 線形代数 演習 1h20m",
		);
	});
	it("確認待ちがあれば付ける", () => {
		expect(formatDailySummary(rows, true)).toMatch(/\(未確定あり\)$/);
	});
});

describe("本文", () => {
	it("Discord は content(2000字で切る・メンション無効)、Slack は text", () => {
		const long = "あ".repeat(3000);
		const d = buildWebhookBody("discord", long) as { content: string; allowed_mentions: unknown };
		expect(d.content).toHaveLength(2000);
		expect(d.content.endsWith("…")).toBe(true);
		expect(d.allowed_mentions).toEqual({ parse: [] });
		expect(buildWebhookBody("slack", "a <b> & c")).toEqual({ text: "a &lt;b&gt; &amp; c" });
		expect(truncateText("abc", 3)).toBe("abc");
	});
});

describe("URL の検証とマスク", () => {
	it("公式の形だけ通す", () => {
		expect(isValidWebhookUrl("discord", DISCORD)).toBe(true);
		expect(isValidWebhookUrl("discord", DISCORD.replace("discord.com", "discordapp.com"))).toBe(true);
		expect(isValidWebhookUrl("slack", SLACK)).toBe(true);
	});
	it("kind 違い・http・他の host・認証情報・壊れた値は拒否", () => {
		expect(isValidWebhookUrl("slack", DISCORD)).toBe(false);
		expect(isValidWebhookUrl("discord", SLACK)).toBe(false);
		expect(isValidWebhookUrl("discord", DISCORD.replace("https", "http"))).toBe(false);
		expect(isValidWebhookUrl("discord", "https://evil.example/api/webhooks/1/a")).toBe(false);
		expect(isValidWebhookUrl("discord", "https://discord.com.evil.example/api/webhooks/1/a")).toBe(false);
		expect(isValidWebhookUrl("discord", "https://user:pw@discord.com/api/webhooks/1/a")).toBe(false);
		expect(isValidWebhookUrl("slack", "https://hooks.slack.com/other/T/B/X")).toBe(false);
		expect(isValidWebhookUrl("slack", "not a url")).toBe(false);
	});
	it("マスクは host と末尾6文字だけ", () => {
		const masked = maskWebhookUrl(DISCORD);
		expect(masked).toBe("discord.com/…IjKlMn");
		expect(masked).not.toContain("123456789012345678");
	});
	it("作成スキーマは kind と URL の組を見て、events を重複排除する", () => {
		const ok = v.safeParse(webhookCreateSchema, {
			kind: "slack",
			url: SLACK,
			events: ["submitted", "submitted"],
		});
		expect(ok.success && ok.output).toMatchObject({ events: ["submitted"], enabled: true });
		expect(v.safeParse(webhookCreateSchema, { kind: "slack", url: DISCORD, events: [] }).success).toBe(false);
		expect(v.safeParse(webhookCreateSchema, { kind: "slack", url: SLACK, events: ["x"] }).success).toBe(false);
	});
});
