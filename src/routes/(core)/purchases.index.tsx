import { createFileRoute } from '@tanstack/react-router'

import { getPurchaseSummary } from '@/api/purchases'
import { PurchasesPageContent } from '@/components/purchases/purchases-page'
import { usePurchasesSSE } from '@/lib/use-purchases-sse'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/purchases/')({
	head: pageHead(() => m.page_purchases()),
	loader: () => getPurchaseSummary(),
	component: PurchasesPage,
})

function PurchasesPage() {
	usePurchasesSSE()
	const data = Route.useLoaderData()
	return <PurchasesPageContent items={data.items} partner={data.partner} />
}
