import { ClientOnly, createFileRoute } from '@tanstack/react-router'

import { CronDeploymentBanner } from '@/components/admin/cron-deployment-banner'
import { CronEndpointsPanel } from '@/components/admin/cron-endpoints-panel'
import { CronRunsTable } from '@/components/admin/cron-runs-table'
import { CronTimeZoneBanner } from '@/components/admin/cron-time-zone-banner'
import { RichMessage } from '@/components/common/rich-message'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/scheduling')({
	head: pageHead(() => m.page_scheduling()),
	component: AdminSchedulingPage,
})

function AdminSchedulingPage() {
	return (
		<>
			<ClientOnly>
				<CronDeploymentBanner />
				<CronTimeZoneBanner />
			</ClientOnly>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_scheduling_endpoints_title()}</CardTitle>
					<CardDescription>
						<RichMessage
							parts={m.admin_nav_scheduling_endpoints_description.parts()}
							tags={{ code: c => <code>{c}</code>, em: c => <em>{c}</em> }}
						/>
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<CronEndpointsPanel />
					</ClientOnly>
				</CardContent>
			</Card>

			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_scheduling_history_title()}</CardTitle>
					<CardDescription>{m.admin_nav_scheduling_history_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<CronRunsTable />
					</ClientOnly>
				</CardContent>
			</Card>
		</>
	)
}
