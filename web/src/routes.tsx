import type { ComponentType, ReactNode } from "react";
import { EveningPage } from "./pages/EveningPage";
import { HomePage } from "./pages/HomePage";
import { InboxPage } from "./pages/InboxPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SharePage } from "./pages/SharePage";
import { SlackPage } from "./pages/SlackPage";
import { StatusPage } from "./pages/StatusPage";
import { TaskDetailPage } from "./pages/TaskDetailPage";
import { TasksPage } from "./pages/TasksPage";
import { TimetablePage } from "./pages/TimetablePage";

export type NavItem = { to: string; label: string; icon: ReactNode };

const stroke = (d: string) => <path d={d} />;

// 下タブ。受信箱は普段は空なので足さない(ホームのバナーと一覧のリンクから入る)
export const NAV: readonly NavItem[] = [
	{ to: "/", label: "ホーム", icon: stroke("M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6") },
	{ to: "/tasks", label: "一覧", icon: stroke("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01") },
	{ to: "/slack", label: "余裕", icon: <circle cx="12" cy="12" r="8" /> },
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
	{ path: "/inbox", component: InboxPage },
	{ path: "/slack", component: SlackPage },
	{ path: "/evening", component: EveningPage },
	{ path: "/status", component: StatusPage },
	{ path: "/share", component: SharePage },
	{ path: "/timetable", component: TimetablePage },
	{ path: "/settings", component: SettingsPage },
];
