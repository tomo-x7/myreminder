import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import type { NavItem } from "../routes";

function isActive(location: string, item: NavItem): boolean {
	if (item.to === "/") return location === "/";
	return location === item.to || location.startsWith(`${item.to}/`);
}

/** 下タブ付きの外枠。タブは routes.tsx の NAV から作る */
export function Layout({ nav, children }: { nav: readonly NavItem[]; children: ReactNode }) {
	const [location] = useLocation();
	return (
		<div className="mx-auto flex min-h-svh max-w-xl flex-col bg-gray-50 text-gray-900">
			<main className="flex-1 px-4 pt-4 pb-28">{children}</main>
			<nav
				aria-label="メニュー"
				className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]"
			>
				<ul className="mx-auto flex max-w-xl">
					{nav.map((item) => {
						const active = isActive(location, item);
						return (
							<li key={item.to} className="flex-1">
								<Link
									href={item.to}
									aria-current={active ? "page" : undefined}
									className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${
										active ? "text-blue-700" : "text-gray-500"
									}`}
								>
									<svg
										viewBox="0 0 24 24"
										width="24"
										height="24"
										fill="none"
										stroke="currentColor"
										strokeWidth={active ? 2.4 : 1.8}
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
