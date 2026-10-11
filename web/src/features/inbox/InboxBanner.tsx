import { Link } from "wouter";
import { useInboxCount } from "core/queries/inbox";

/** 受信箱の確認待ちの件数。0件(と読み込み中・失敗)のときは null */
export function useInboxTotal(): number | null {
	const count = useInboxCount();
	const total = (count.data?.pending ?? 0) + (count.data?.changes ?? 0);
	return total === 0 ? null : total;
}

/** 「受信箱: 確認待ち N件 →」。0件のときは何も出さない */
export function InboxBanner() {
	const total = useInboxTotal();
	if (total === null) return null;
	return (
		<Link href="/inbox" className="flex items-center justify-between border-l-2 border-ink py-0.5 pl-2 text-sm">
			<span>
				受信箱: 確認待ち <span className="font-semibold">{total}件</span>
			</span>
			<span aria-hidden="true" className="text-faint">
				›
			</span>
		</Link>
	);
}
