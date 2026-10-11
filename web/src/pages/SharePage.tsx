import { sharedToQuickAdd } from "core/forms/quick-add";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Notice, PageHeader } from "../components/ui";
import { takeSharedImage } from "../features/quick-add/image";
import { QuickAdd } from "../features/quick-add/QuickAdd";

/**
 * Web Share Target の受け口。貼り付けと同じ確認カードを、AI で解析済みの状態で開く(テキストがなければ手入力)。
 * - テキスト: `/share?title=&text=&url=`
 * - 画像: `/share?image=1`。Service Worker が受けた画像を Cache に入れてここへ飛ばす
 */
export function SharePage() {
	const [, navigate] = useLocation();
	// 共有された内容は最初の描画で固定する(再描画で入力が書き換わらないように)
	const [params] = useState(() => new URLSearchParams(window.location.search));
	const shared = sharedToQuickAdd({ title: params.get("title"), text: params.get("text"), url: params.get("url") });
	const wantsImage = params.get("image") === "1";
	// undefined: 読み込み中、null: 画像がなかった
	const [image, setImage] = useState<Blob | null | undefined>(wantsImage ? undefined : null);
	useEffect(() => {
		if (!wantsImage) return;
		void takeSharedImage().then(setImage);
	}, [wantsImage]);

	const home = useCallback(() => navigate("/", { replace: true }), [navigate]);

	return (
		<div className="flex flex-col gap-3">
			<PageHeader title="共有" />
			{image === undefined ? (
				<p className="py-6 text-center text-xs text-faint">読み込み中…</p>
			) : (
				<QuickAdd
					onDone={home}
					onCancel={home}
					initialText={shared.initialText}
					initialMode={shared.initialMode}
					autoSubmit={shared.autoSubmit}
					initialImage={image ?? undefined}
				/>
			)}
			{wantsImage && image === null && (
				<div role="alert">
					<Notice tone="warn">画像を受け取れなかった</Notice>
				</div>
			)}
		</div>
	);
}
