import { createFileRoute } from '@tanstack/react-router'

import { getMyPurchases } from '@/api/purchases'
import { PurchasesPageContent } from '@/components/purchases/purchases-page'

export const Route = createFileRoute('/(core)/purchases/')({
	loader: () => getMyPurchases(),
	component: PurchasesPage,
})

function PurchasesPage() {
	const data = Route.useLoaderData()
	return <PurchasesPageContent {...data} />
}
