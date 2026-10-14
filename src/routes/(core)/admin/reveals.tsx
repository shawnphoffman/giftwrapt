import { createFileRoute } from '@tanstack/react-router'

import HiddenPurchases from '@/components/admin/hidden-purchases'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/reveals')({
	head: pageHead('Reveals'),
	component: AdminRevealsPage,
})

function AdminRevealsPage() {
	return (
		<Card className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Hidden Gifts</CardTitle>
				<CardDescription>
					Lists with claimed or off-list gifts their recipient can&apos;t see yet. They reveal on their own on the date shown. Reveal one
					early when the gifts were already given, for example purchases logged after that occasion&apos;s reveal. Lists you&apos;re the
					recipient of aren&apos;t shown.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<HiddenPurchases />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
