import { createFileRoute } from '@tanstack/react-router'

import { getPurchaseSummary } from '@/api/purchases'
import { PurchasesPageContent } from '@/components/purchases/purchases-page'
import { usePurchasesSSE } from '@/lib/use-purchases-sse'

export const Route = createFileRoute('/(core)/purchases/')({
	loader: () => getPurchaseSummary(),
	component: PurchasesPage,
})

function PurchasesPage() {
	usePurchasesSSE()
	const data = Route.useLoaderData()
	return <PurchasesPageContent items={data.items} partner={data.partner} />
}
