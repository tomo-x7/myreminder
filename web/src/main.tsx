import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.tailwind.css";
import { registerServiceWorker } from "./push";

// 画面を開き直したときに最新へ更新する。失敗の再試行は 1 回だけ(401/403 は api.ts が再読み込みする)
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

// 共有メニューから送られた写真・テキスト(POST /share)は Service Worker が受ける。通知をオフにしていても要る
if ("serviceWorker" in navigator) registerServiceWorker().catch((e) => console.error(e));

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</StrictMode>,
);
