import { useCallback } from "react";
import { useLocation } from "wouter";
import { PageHeader } from "../components/ui";
import { QuickAdd } from "../features/quick-add/QuickAdd";
import { useCreateTasks } from "../lib/queries";

// QuickAdd の貼り付け入力の上限(TEXT_MAX)に合わせる
const SHARE_TEXT_MAX = 8000;

/**
 * 共有された title / text / url を1つのテキストにまとめる。
 * Android の Chrome などは URL を text に入れて送ってくるので、すでに含まれているものは足さない。
 */
export function combineShared(params: URLSearchParams): string {
	const title = (params.get("title") ?? "").trim();
	const text = (params.get("text") ?? "").trim();
	const url = (params.get("url") ?? "").trim();
	const lines: string[] = [];
	if (title && !text.includes(title)) lines.push(title);
	if (text) lines.push(text);
	if (url && !text.includes(url)) lines.push(url);
	return lines.join("\n").slice(0, SHARE_TEXT_MAX);
}

/** Web Share Target の受け口(`/share?title=&text=&url=`)。貼り付けと同じ確認カードを、解析済みの状態で開く */
export function SharePage() {
	const [, navigate] = useLocation();
	const create = useCreateTasks();
	// 共有された内容は最初の描画で固定する(再描画で入力が書き換わらないように)
	const shared = combineShared(new URLSearchParams(window.location.search));

	const save = useCallback(
		async (inputs: Parameters<typeof create.mutateAsync>[0]) => {
			await create.mutateAsync(inputs);
			navigate("/", { replace: true });
		},
		[create.mutateAsync, navigate],
	);
	const cancel = useCallback(() => navigate("/", { replace: true }), [navigate]);

	return (
		<div className="flex flex-col gap-4">
			<PageHeader title="共有から追加" />
			<QuickAdd
				onConfirm={save}
				onCancel={cancel}
				initialText={shared}
				initialMode={shared ? "text" : "line"}
				autoSubmit={shared !== ""}
			/>
		</div>
	);
}
