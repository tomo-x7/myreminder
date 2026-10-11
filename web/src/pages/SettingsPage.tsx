import { errorText } from "core/domain/errors";
import { useState } from "react";
import { Link } from "wouter";
import { listClass, PageHeader, QueryState, SectionTitle } from "../components/ui";
import { SettingsForm } from "../features/settings/SettingsForm";
import { WebhookSettings } from "../features/webhooks";
import { useSettings, useUpdateSettings } from "core/queries/settings";
import { PushToggle } from "../push/PushToggle";

export function SettingsPage() {
	const settings = useSettings();
	const update = useUpdateSettings();
	const [saved, setSaved] = useState(false);

	return (
		<div className="flex flex-col gap-3">
			<PageHeader title="設定" />
			<section className="flex flex-col gap-2">
				<SectionTitle>プッシュ通知(この端末)</SectionTitle>
				<PushToggle />
			</section>
			<section className="flex flex-col">
				<SectionTitle>ステータスと作業記録</SectionTitle>
				<ul className={listClass}>
					<li>
						<Link href="/status" className="flex items-baseline justify-between gap-2 py-2 active:bg-wash">
							作業記録を見る・直す
							<span aria-hidden="true" className="text-faint">
								›
							</span>
						</Link>
					</li>
				</ul>
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
						error={update.isError ? errorText(update.error) : null}
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
