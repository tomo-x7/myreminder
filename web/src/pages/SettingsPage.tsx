import { useState } from "react";
import { Link } from "wouter";
import { PageHeader, QueryState, SectionTitle } from "../components/ui";
import { SettingsForm } from "../features/settings/SettingsForm";
import { WebhookSettings } from "../features/webhooks";
import { useSettings, useUpdateSettings } from "../lib/queries";
import { PushToggle } from "../push/PushToggle";

export function SettingsPage() {
	const settings = useSettings();
	const update = useUpdateSettings();
	const [saved, setSaved] = useState(false);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader title="設定" />
			<section className="flex flex-col gap-2">
				<SectionTitle>プッシュ通知(この端末)</SectionTitle>
				<PushToggle />
			</section>
			<section className="flex flex-col gap-2">
				<SectionTitle>ステータスと作業記録</SectionTitle>
				<Link
					href="/status"
					className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-800"
				>
					作業記録を見る・直す →
				</Link>
			</section>
			<section className="flex flex-col gap-2">
				<SectionTitle>Discord / Slack への報告</SectionTitle>
				<WebhookSettings />
			</section>
			<QueryState query={settings}>
				{(s) => (
					<SettingsForm
						settings={s}
						saving={update.isPending}
						error={update.isError ? update.error.message : null}
						saved={saved}
						onSave={(patch) => {
							setSaved(false);
							update.mutate(patch, { onSuccess: () => setSaved(true) });
						}}
					/>
				)}
			</QueryState>
		</div>
	);
}
