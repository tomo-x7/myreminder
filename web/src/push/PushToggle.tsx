import { useEffect, useState } from "react";
import { btnPrimary, btnSecondary, Notice } from "../components/ui";
import { disablePush, enablePush, getPushState, type PushState, sendTestPush } from "./index";

const STATE_TEXT: Record<PushState, string> = {
	unsupported: "非対応のブラウザ",
	unconfigured: "Firebase が未設定",
	denied: "ブロック中",
	off: "オフ",
	on: "オン",
};

// 状態は小さな点で示す(オンは墨、オフは白抜き、使えないときは灰)
const STATE_DOT: Record<PushState, string> = {
	unsupported: "bg-faint",
	unconfigured: "bg-faint",
	denied: "bg-danger",
	off: "border border-sub",
	on: "bg-ink",
};

/** 通知のオン/オフとテスト送信。設定画面などに置く */
export function PushToggle() {
	const [state, setState] = useState<PushState>();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string>();

	useEffect(() => {
		getPushState().then(setState);
	}, []);

	const run = async (fn: () => Promise<{ ok: boolean; message?: string } | undefined>, okText?: string) => {
		setBusy(true);
		setMessage(undefined);
		const r = await fn();
		setMessage(r && !r.ok ? r.message : okText);
		setState(await getPushState());
		setBusy(false);
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<span
					aria-hidden="true"
					className={`size-2 shrink-0 rounded-full ${state ? STATE_DOT[state] : "border border-line"}`}
				/>
				<p className="min-w-0 flex-1">{state ? STATE_TEXT[state] : "確認中…"}</p>
				<div className="flex shrink-0 gap-1.5">
					{state === "on" ? (
						<>
							<button
								type="button"
								disabled={busy}
								className={btnSecondary}
								onClick={() => run(() => disablePush().then(() => undefined))}
							>
								無効化
							</button>
							<button
								type="button"
								disabled={busy}
								className={btnSecondary}
								onClick={() => run(sendTestPush, "送信済み")}
							>
								テスト
							</button>
						</>
					) : (
						<button
							type="button"
							disabled={busy || state === undefined || state === "unsupported" || state === "denied"}
							className={btnPrimary}
							onClick={() => run(enablePush)}
						>
							有効化
						</button>
					)}
				</div>
			</div>
			{message && <Notice>{message}</Notice>}
		</div>
	);
}
