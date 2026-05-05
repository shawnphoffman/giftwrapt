import { ClientOnly, createFileRoute } from '@tanstack/react-router'

import { CronDeploymentBanner } from '@/components/admin/cron-deployment-banner'
import { CronEndpointsPanel } from '@/components/admin/cron-endpoints-panel'
import { CronRunsTable } from '@/components/admin/cron-runs-table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/admin/scheduling')({
	component: AdminSchedulingPage,
})

function AdminSchedulingPage() {
	return (
		<>
			<ClientOnly>
				<CronDeploymentBanner />
			</ClientOnly>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Cron endpoints</CardTitle>
					<CardDescription>
						Each row is a registered <code>/api/cron/*</code> route. <em>Last success</em> goes amber when the gap exceeds three intervals,
						which usually means the scheduler has stopped firing.
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
					<CardTitle className="text-2xl">Run history</CardTitle>
					<CardDescription>
						Every invocation writes a row here. History is kept for the configured retention window (default 90 days) and pruned daily by
						the verification-cleanup tick.
					</CardDescription>
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
