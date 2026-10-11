// エラーのコード → 画面に出す文言(「何が・どうだ」)。API のコードはサーバーが決め(ai-docs/specs/client.md「エラー」)、文言はここで決める
import { ApiError } from "../api/errors";

const URL_FORMAT_ERROR = "webhook URLが不正";
const ALREADY_DONE = "処理済み";

// 網羅するコードは ai-docs/specs/client.md「エラー」の表。unauthorized だけはクライアントが作る(Access の失敗は本文が JSON とは限らない)
const ERROR_TEXT: Record<string, string> = {
	// 共通
	invalid_input: "入力が不正",
	internal: "サーバーエラー",
	http_error: "リクエストエラー",
	not_found: "見つからない",
	too_large: "1.5MBまで",
	unsupported_media_type: "JPEG・PNG・WebPのみ",
	unauthorized: "認証エラー",
	// タスク・科目・予定・計画
	invalid_course: "科目が見つからない",
	invalid_task: "タスクが見つからない",
	invalid_busy_block: "予定が不正",
	invalid_week: "週が不正",
	// 状態・作業記録
	overlap: "時間が重なる",
	invalid_range: "終了が開始より前",
	invalid_end_at: "終了が開始〜現在の外",
	not_working: "作業中ではない",
	working: "作業中",
	task_closed: "提出済み・取り下げのタスク",
	invalid_until: "期限が過去",
	// 受信箱(取り込み済みの項目が別の端末で処理されたとき)
	not_pending: ALREADY_DONE,
	no_change: ALREADY_DONE,
	// webhook(URL は秘密情報なので、入力値は文言に含めない)
	invalid_webhook: URL_FORMAT_ERROR,
	invalid_webhook_url: URL_FORMAT_ERROR,
};

/** 画面に出すエラー文。表にないコードは message、それもなければコードのまま。ApiError でなければ通信の失敗 */
export function errorText(e: unknown): string {
	if (!(e instanceof ApiError)) return "通信エラー";
	return ERROR_TEXT[e.code] ?? e.message;
}
