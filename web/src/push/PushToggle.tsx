import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushState, type PushState, sendTestPush, syncPush } from "./index";

const STATE_TEXT: Record<PushState, string> = {
	unsupported: "このブラウザは通知に対応していません",
	unconfigured: "Firebase の設定が未入力です",
	denied: "通知がブロックされています(ブラウザの設定で許可)",
	off: "通知はオフです",
	on: "通知はオンです",
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

	const button = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";
	return (
		<div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
			<p className="text-sm">{state ? STATE_TEXT[state] : "確認中…"}</p>
			<div className="flex gap-2">
				{state === "on" ? (
					<>
						<button
							type="button"
							disabled={busy}
							className={`${button} border border-gray-300`}
							onClick={() => run(() => disablePush().then(() => undefined))}
						>
							オフにする
						</button>
						<button
							type="button"
							disabled={busy}
							className={`${button} bg-indigo-600 text-white`}
							onClick={() => run(sendTestPush, "テスト通知を送りました")}
						>
							テスト通知
						</button>
					</>
				) : (
					<button
						type="button"
						disabled={busy || state === undefined || state === "unsupported" || state === "denied"}
						className={`${button} bg-indigo-600 text-white`}
						onClick={() => run(enablePush)}
					>
						通知をオンにする
					</button>
				)}
			</div>
			{message && <p className="text-sm text-gray-600">{message}</p>}
		</div>
	);
}
