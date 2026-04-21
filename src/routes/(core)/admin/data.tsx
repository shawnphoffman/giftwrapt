import { createFileRoute } from '@tanstack/react-router'

import ExportData from '@/components/admin/export-data'
import ImportData from '@/components/admin/import-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/data')({
	component: AdminDataPage,
})

function AdminDataPage() {
	return (
		<>
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Export backup</CardTitle>
					<CardDescription>Download a JSON snapshot of all app data.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ExportData />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Import backup</CardTitle>
					<CardDescription>Restore app data from a previously exported JSON snapshot.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ImportData />
					</ClientOnly>
				</CardContent>
			</Card>
		</>
	)
}
