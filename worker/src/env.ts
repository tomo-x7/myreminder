// Worker の環境の型。secret は wrangler types に出ないので、ここで足す
export type Bindings = CloudflareBindings & {
	/** FCM のサービスアカウント JSON(wrangler secret put FCM_SERVICE_ACCOUNT) */
	FCM_SERVICE_ACCOUNT?: string;
};

export type Env = { Bindings: Bindings };
