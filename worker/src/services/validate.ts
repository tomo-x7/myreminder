// 入力の検証。失敗は 400 { error: "invalid_input", issues } に揃える(契約は ai-docs/specs/client.md)
import { vValidator } from "@hono/valibot-validator";
import type { Context, ValidationTargets } from "hono";
import type { BaseIssue, GenericSchema } from "valibot";

/** valibot の issue を "項目: 理由" にする。入力値そのものは含めない(webhook URL など秘密情報があるため) */
export function formatIssues(issues: readonly BaseIssue<unknown>[]): string[] {
	return issues.map((i) => `${i.path?.map((p) => String(p.key)).join(".") ?? ""}: ${i.message}`);
}

/**
 * `vValidator` の代わりに使う。型推論(Hono RPC)はそのまま効く。
 * code はルート固有のコードにしたいときだけ渡す(webhook は invalid_webhook)
 */
export const validate = <
	T extends GenericSchema,
	Target extends keyof ValidationTargets,
	Code extends string = "invalid_input",
>(
	target: Target,
	schema: T,
	code: Code = "invalid_input" as Code,
) =>
	vValidator(target, schema, (result, c: Context) => {
		if (!result.success) return c.json({ error: code, issues: formatIssues(result.issues) }, 400);
	});
