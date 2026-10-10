import { getDb } from "./db";
import type { Bindings } from "./env";
import { dispatchDueNotifications } from "./notify/dispatch";
import { replanNotifications } from "./notify/replan";
import { sendDailySummaryIfDue } from "./notify/webhook";
import { checkWorkingSessions } from "./services/status";

/**
 * 毎分の cron から呼ばれる。ステップごとに try/catch して、1つが落ちても残りを動かす。
 * 再計画(通知とダイジェストの生成、#16)は毎時0分。ほかのタイミングは、変更のあった API が waitUntil で呼ぶ
 */
export async function runScheduled(event: ScheduledController, env: Bindings, _ctx: ExecutionContext): Promise<void> {
	const now = event.scheduledTime;
	const steps: { name: string; run: () => Promise<unknown> }[] = [
		// 作業中の消し忘れ確認が作る通知を、同じ回で送れるよう先に動かす
		{ name: "checkWorkingSessions", run: () => checkWorkingSessions(getDb(env), now) },
		// 時間の経過でリスクや切れ目が変わるので、毎時0分に作り直す(JST は +9:00 固定なので UTC の分と同じ)
		...(new Date(now).getUTCMinutes() === 0
			? [{ name: "replanNotifications", run: () => replanNotifications(getDb(env), now) }]
			: []),
		{ name: "dispatchDueNotifications", run: () => dispatchDueNotifications(env, now) },
		// Discord / Slack へのその日の作業時間の報告(夜のダイジェストの時刻以降、1日1回)
		{ name: "sendDailySummaryIfDue", run: () => sendDailySummaryIfDue(getDb(env), now) },
	];
	for (const step of steps) {
		try {
			await step.run();
		} catch (e) {
			console.error(`cron step failed: ${step.name}`, e);
		}
	}
}
