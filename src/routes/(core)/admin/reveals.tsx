import { createFileRoute } from '@tanstack/react-router'

import HiddenPurchases from '@/components/admin/hidden-purchases'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/reveals')({
	head: pageHead(() => m.page_reveals()),
	component: AdminRevealsPage,
})

function AdminRevealsPage() {
	return (
		<Card className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_data_reveals_title()}</CardTitle>
				<CardDescription>{m.admin_data_reveals_description()}</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<HiddenPurchases />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
