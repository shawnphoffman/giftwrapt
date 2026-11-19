import { createFileRoute } from '@tanstack/react-router'

import ExportData from '@/components/admin/export-data'
import ImportData from '@/components/admin/import-data'
import PurgeData from '@/components/admin/purge-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/data')({
	head: pageHead(() => m.page_data()),
	component: AdminDataPage,
})

function AdminDataPage() {
	return (
		<>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_data_page_export_title()}</CardTitle>
					<CardDescription>{m.admin_data_page_export_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ExportData />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_data_page_import_title()}</CardTitle>
					<CardDescription>{m.admin_data_page_import_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ImportData />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl border-destructive/40">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_data_page_purge_title()}</CardTitle>
					<CardDescription>{m.admin_data_page_purge_description()}</CardDescription>
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
