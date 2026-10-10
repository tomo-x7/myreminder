import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";

function App() {
	const health = useQuery({
		queryKey: ["health"],
		queryFn: async () => {
			const res = await api.api.health.$get();
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return res.json();
		},
	});

	return (
		<main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-4">
			<h1 className="text-3xl font-bold">myreminder</h1>
			<section className="rounded-lg border border-gray-300 p-4 text-sm">
				<h2 className="mb-2 font-semibold">health</h2>
				{health.isPending && <p>読み込み中…</p>}
				{health.isError && <p className="text-red-600">エラー: {health.error.message}</p>}
				{health.data && (
					<p>
						ok: {String(health.data.ok)} ・ {new Date(health.data.now).toLocaleString("ja-JP")}
					</p>
				)}
			</section>
		</main>
	);
}

export default App;
