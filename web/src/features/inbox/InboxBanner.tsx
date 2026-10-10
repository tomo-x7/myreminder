import { Link } from "wouter";
import { useInboxCount } from "./hooks";

/** 「受信箱: 確認待ち N件 →」。0件(と読み込み中・失敗)のときは何も出さない */
export function InboxBanner({ className }: { className: string }) {
	const count = useInboxCount();
	const total = (count.data?.pending ?? 0) + (count.data?.changes ?? 0);
	if (total === 0) return null;
	return (
		<Link href="/inbox" className={className}>
			受信箱: 確認待ち {total}件 →
		</Link>
	);
}
