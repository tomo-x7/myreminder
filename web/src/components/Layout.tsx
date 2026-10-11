import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ReviewPrompt } from "../features/status";
import type { NavItem } from "../routes";

function isActive(location: string, item: NavItem): boolean {
	if (item.to === "/") return location === "/";
	return location === item.to || location.startsWith(`${item.to}/`);
}

/** 下タブ付きの外枠。タブは routes.tsx の NAV から作る */
export function Layout({ nav, children }: { nav: readonly NavItem[]; children: ReactNode }) {
	const [location] = useLocation();
	return (
		<div className="mx-auto flex min-h-svh max-w-xl flex-col bg-paper text-sm text-ink">
			<main className="flex flex-1 flex-col gap-3 px-3 pt-3 pb-20">
				{/* 消し忘れの作業記録は、次に開いたときに「いつ終わった?」と聞く */}
				<ReviewPrompt />
				{children}
			</main>
			<nav
				aria-label="メニュー"
				className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]"
			>
				<ul className="mx-auto flex max-w-xl">
					{nav.map((item) => {
						const active = isActive(location, item);
						return (
							<li key={item.to} className="flex-1">
								<Link
									href={item.to}
									aria-current={active ? "page" : undefined}
									className={`flex flex-col items-center gap-0.5 pt-1.5 pb-1 text-[10px] leading-3 ${
										active ? "font-semibold text-ink" : "text-faint"
									}`}
								>
									<svg
										viewBox="0 0 24 24"
										width="20"
										height="20"
										fill="none"
										stroke="currentColor"
										strokeWidth={active ? 2.2 : 1.6}
										strokeLinecap="round"
										strokeLinejoin="round"
										aria-hidden="true"
									>
										{item.icon}
									</svg>
									{item.label}
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>
		</div>
	);
}
