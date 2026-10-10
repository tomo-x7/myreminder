// Worker の環境の型。secret は wrangler types に出ないので、ここで足す
export type Bindings = CloudflareBindings & {
	/** FCM のサービスアカウント JSON(wrangler secret put FCM_SERVICE_ACCOUNT)。未設定なら送信は no-op */
	FCM_SERVICE_ACCOUNT?: string;
	/** 通知タップ時に開くアプリの origin。未設定は https://reminder.tomo-x.win */
	APP_ORIGIN?: string;
};

export type Env = { Bindings: Bindings };
