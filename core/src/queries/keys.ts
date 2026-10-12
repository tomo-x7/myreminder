// TanStack Query のキー。全画面で共有する(キーが同じなら同じキャッシュ)。
// 下位のキー(["tasks", id] など)は上位のキーの配下なので、上位を無効化すれば一緒に取り直される
export const queryKeys = {
	tasks: ["tasks"],
	series: ["series"],
	courses: ["courses"],
	/** 入力欄の下の「実績」(見積もりの参照クラス) */
	estimateReference: ["estimate-reference"],
	busyBlocks: ["busy-blocks"],
	settings: ["settings"],
	/** 計画。タスク・予定・設定のどれが変わっても変わる */
	schedule: ["schedule"],
	status: ["status"],
	sessions: ["sessions"],
	inbox: ["inbox"],
	review: ["review"],
	webhooks: ["webhooks"],
} as const;
