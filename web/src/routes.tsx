import type { ComponentType, ReactNode } from "react";
import { HomePage } from "./pages/HomePage";
import { SettingsPage } from "./pages/SettingsPage";
import { TaskDetailPage } from "./pages/TaskDetailPage";
import { TasksPage } from "./pages/TasksPage";
import { TimetablePage } from "./pages/TimetablePage";

export type NavItem = { to: string; label: string; icon: ReactNode };

const stroke = (d: string) => <path d={d} />;

// 下タブ。余裕リスト・受信箱は、画面ができたらここに足す(ROUTES にも対応する行を足す)
export const NAV: readonly NavItem[] = [
	{ to: "/", label: "ホーム", icon: stroke("M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6") },
	{ to: "/tasks", label: "一覧", icon: stroke("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01") },
	{ to: "/timetable", label: "時間割", icon: stroke("M3 5h18v16H3zM3 10h18M8 3v4M16 3v4") },
	{
		to: "/settings",
		label: "設定",
		icon: (
			<>
				<path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
				<circle cx="15" cy="7" r="2" />
				<circle cx="9" cy="17" r="2" />
			</>
		),
	},
];

export const ROUTES: readonly { path: string; component: ComponentType }[] = [
	{ path: "/", component: HomePage },
	{ path: "/tasks", component: TasksPage },
	{ path: "/tasks/:id", component: TaskDetailPage },
	{ path: "/timetable", component: TimetablePage },
	{ path: "/settings", component: SettingsPage },
];
