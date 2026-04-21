import { createFileRoute } from '@tanstack/react-router'

import { getPurchaseSummary } from '@/api/purchases'
import { PurchasesPageContent } from '@/components/purchases/purchases-page'

export const Route = createFileRoute('/(core)/purchases/')({
	loader: () => getPurchaseSummary(),
	component: PurchasesPage,
})

function PurchasesPage() {
	const items = Route.useLoaderData()
	return <PurchasesPageContent items={items} />
}
