import { useEffect, useState } from "react";
import { btnPrimary, btnSecondary, Notice } from "../components/ui";
import { disablePush, enablePush, getPushState, type PushState, sendTestPush, syncPush } from "./index";

const STATE_TEXT: Record<PushState, string> = {
	unsupported: "このブラウザは通知に対応していません",
	unconfigured: "Firebase の設定が未入力です",
	denied: "通知がブロックされています(ブラウザの設定で許可)",
	off: "通知はオフです",
	on: "通知はオンです",
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
		syncPush();
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
								オフにする
							</button>
							<button
								type="button"
								disabled={busy}
								className={btnSecondary}
								onClick={() => run(sendTestPush, "テスト通知を送りました")}
							>
								テスト通知
							</button>
						</>
					) : (
						<button
							type="button"
							disabled={busy || state === undefined || state === "unsupported" || state === "denied"}
							className={btnPrimary}
							onClick={() => run(enablePush)}
						>
							通知をオンにする
						</button>
					)}
				</div>
			</div>
			{message && <Notice>{message}</Notice>}
		</div>
	);
}
