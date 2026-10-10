import type { Bindings } from "./env";

/** 毎分の cron から呼ばれる。通知の送信(#8)、再計画・ダイジェスト(#11 以降)をここに足していく */
export async function runScheduled(
	_event: ScheduledController,
	_env: Bindings,
	_ctx: ExecutionContext,
): Promise<void> {}
