import { useEffect, useState } from "react";

/** 一定間隔で更新される現在時刻(epoch ms)。相対表示(`3日後` など)を古くしないため */
export function useNow(intervalMs = 30_000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}
