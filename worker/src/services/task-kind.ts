/** メモの制約は、通知設定やクライアントの入力にかかわらずサーバーで保持する。 */
export function normalizeTaskKind<
	T extends {
		taskKind?: "work" | "note";
		estimateMin: number;
		completionNotify?: boolean;
		plannedStartAt?: number | null;
		releaseAt?: number | null;
		minBlockMin?: number;
	},
>(input: T): T {
	return input.taskKind === "note"
		? { ...input, estimateMin: 0, completionNotify: false, plannedStartAt: null, releaseAt: null, minBlockMin: 1 }
		: input;
}
