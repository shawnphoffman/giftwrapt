import { createFileRoute } from '@tanstack/react-router'

import ExportData from '@/components/admin/export-data'
import ImportData from '@/components/admin/import-data'
import PurgeData from '@/components/admin/purge-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/data')({
	component: AdminDataPage,
})

function AdminDataPage() {
	return (
		<>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Export Backup</CardTitle>
					<CardDescription>Download a JSON snapshot of all app data.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ExportData />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Import Backup</CardTitle>
					<CardDescription>Restore app data from a previously exported JSON snapshot.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ImportData />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl border-destructive/40">
				<CardHeader>
					<CardTitle className="text-2xl">Purge All Data</CardTitle>
					<CardDescription>
						Permanently delete every list, item, claim, comment, addon, and editor record. Users, guardianships, and partner links are
						preserved. Cannot be undone.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<PurgeData />
					</ClientOnly>
				</CardContent>
			</Card>
		</>
	)
}
