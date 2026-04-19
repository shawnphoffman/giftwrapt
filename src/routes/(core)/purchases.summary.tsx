import { createFileRoute } from '@tanstack/react-router'

import { getPurchaseSummary } from '@/api/purchases'
import { PurchasesSummaryContent } from '@/components/purchases/purchases-summary'

export const Route = createFileRoute('/(core)/purchases/summary')({
	loader: () => getPurchaseSummary(),
	component: PurchasesSummaryPage,
})

function PurchasesSummaryPage() {
	const items = Route.useLoaderData()
	return <PurchasesSummaryContent items={items} />
}
