import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Notice, PageHeader } from "../components/ui";
import { takeSharedImage } from "../features/quick-add/image";
import { QuickAdd } from "../features/quick-add/QuickAdd";
import type { TaskCreateInput } from "../features/quick-add/types";
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

/**
 * Web Share Target の受け口。貼り付けと同じ確認カードを、解析済みの状態で開く。
 * - テキスト: `/share?title=&text=&url=`
 * - 画像: `/share?image=1`。Service Worker が受けた画像を Cache に入れてここへ飛ばす
 */
export function SharePage() {
	const [, navigate] = useLocation();
	const create = useCreateTasks();
	// 共有された内容は最初の描画で固定する(再描画で入力が書き換わらないように)
	const [params] = useState(() => new URLSearchParams(window.location.search));
	const shared = combineShared(params);
	const wantsImage = params.get("image") === "1";
	// undefined: 読み込み中、null: 画像がなかった
	const [image, setImage] = useState<Blob | null | undefined>(wantsImage ? undefined : null);
	useEffect(() => {
		if (!wantsImage) return;
		void takeSharedImage().then(setImage);
	}, [wantsImage]);

	const save = useCallback(
		async (inputs: TaskCreateInput[], onSaved: (index: number) => void) => {
			await create.mutateAsync({ inputs, onSaved });
			navigate("/", { replace: true });
		},
		[create.mutateAsync, navigate],
	);
	const cancel = useCallback(() => navigate("/", { replace: true }), [navigate]);

	return (
		<div className="flex flex-col gap-3">
			<PageHeader title="共有から追加" />
			{image === undefined ? (
				<p className="py-6 text-center text-xs text-faint">共有された画像を読み込んでいます…</p>
			) : (
				<QuickAdd
					onConfirm={save}
					onCancel={cancel}
					initialText={shared}
					initialMode={shared ? "text" : "line"}
					autoSubmit={shared !== ""}
					initialImage={image ?? undefined}
				/>
			)}
			{wantsImage && image === null && (
				<div role="alert">
					<Notice tone="warn">
						共有された画像を受け取れませんでした。アプリの「写真から」で選び直してください
					</Notice>
				</div>
			)}
		</div>
	);
}
