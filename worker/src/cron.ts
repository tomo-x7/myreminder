import { getDb } from "./db";
import type { Bindings } from "./env";
import { dispatchDueNotifications } from "./notify/dispatch";
import { checkWorkingSessions } from "./services/status";

/**
 * 毎分の cron から呼ばれる。ステップごとに try/catch して、1つが落ちても残りを動かす。
 * 再計画(#11 以降)・ダイジェストの生成などは、ここにステップを足していく
 */
export async function runScheduled(event: ScheduledController, env: Bindings, _ctx: ExecutionContext): Promise<void> {
	const now = event.scheduledTime;
	const steps: { name: string; run: () => Promise<unknown> }[] = [
		// 作業中の消し忘れ確認が作る通知を、同じ回で送れるよう先に動かす
		{ name: "checkWorkingSessions", run: () => checkWorkingSessions(getDb(env), now) },
		{ name: "dispatchDueNotifications", run: () => dispatchDueNotifications(env, now) },
	];
	for (const step of steps) {
		try {
			await step.run();
		} catch (e) {
			console.error(`cron step failed: ${step.name}`, e);
		}
	}
}
