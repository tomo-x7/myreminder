// エラーのコード → 画面に出す文言。API のコードはサーバーが決め(ai-docs/specs/client.md「エラー」)、文言はここで決める
import { ApiError } from "../api/errors";

const URL_FORMAT_ERROR = "URL の形が違います(Discord / Slack の webhook URL を貼ってください)";
const ALREADY_DONE = "すでに処理されています(最新の状態に更新しました)";

// 網羅するコードは ai-docs/specs/client.md「エラー」の表。unauthorized だけはクライアントが作る(Access の失敗は本文が JSON とは限らない)
const ERROR_TEXT: Record<string, string> = {
	// 共通
	invalid_input: "入力内容が正しくありません",
	internal: "サーバーでエラーが起きました",
	http_error: "リクエストを処理できませんでした",
	not_found: "見つかりません(削除済みかもしれません)",
	too_large: "大きすぎます(画像は 1.5MB まで)",
	unsupported_media_type: "対応していない形式です(JPEG・PNG・WebP の画像だけ)",
	unauthorized: "認証に失敗しました。ログインし直してください",
	// タスク・科目・予定・計画
	invalid_course: "科目が見つかりません",
	invalid_task: "タスクが見つかりません",
	invalid_busy_block: "予定の内容が正しくありません",
	invalid_week: "週の指定が正しくありません",
	// 状態・作業記録
	overlap: "ほかの作業記録と時間が重なっています",
	invalid_range: "終了は開始より後にしてください",
	invalid_end_at: "終わった時刻は、開始から今までの間にしてください",
	not_working: "作業中ではありません",
	working: "作業中です。先に作業を終えてください",
	task_closed: "提出済み・取り下げのタスクでは作業を始められません",
	invalid_until: "期限が過ぎています",
	// 受信箱(取り込み済みの項目が別の端末で処理されたとき)
	not_pending: ALREADY_DONE,
	no_change: ALREADY_DONE,
	// webhook(URL は秘密情報なので、入力値は文言に含めない)
	invalid_webhook: URL_FORMAT_ERROR,
	invalid_webhook_url: URL_FORMAT_ERROR,
};

/** 画面に出すエラー文。表にないコードは message、それもなければコードのまま。ApiError でなければ通信の失敗 */
export function errorText(e: unknown): string {
	if (!(e instanceof ApiError)) return "通信に失敗しました";
	return ERROR_TEXT[e.code] ?? e.message;
}
