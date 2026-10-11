import { PageHeader } from "../components/ui";
import { SessionLog, StatusSwitcher } from "../features/status";

/** ステータス(通知の「始める」の行き先)と、作業記録の一覧・編集 */
export function StatusPage() {
	return (
		<div className="flex flex-col gap-3">
			<PageHeader title="ステータスと作業記録" />
			<StatusSwitcher />
			<SessionLog />
		</div>
	);
}
