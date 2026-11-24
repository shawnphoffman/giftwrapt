import { useQuery } from '@tanstack/react-query'
import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router'

import { getGiftExchangeAsAdmin } from '@/api/gift-exchanges'
import { GIFT_EXCHANGES_QUERY_KEY } from '@/components/admin/gift-exchange-details-dialog'
import { GiftExchangePage } from '@/components/admin/gift-exchange-page'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/exchanges/$exchangeId')({
	head: pageHead(() => m.page_exchanges()),
	component: AdminExchangePage,
})

function AdminExchangePage() {
	const { exchangeId } = Route.useParams()
	return (
		<ClientOnly fallback={<LoadingSkeleton />}>
			<ExchangeLoader exchangeId={exchangeId} />
		</ClientOnly>
	)
}

function ExchangeLoader({ exchangeId }: { exchangeId: string }) {
	const { data, isLoading, error } = useQuery({
		queryKey: [...GIFT_EXCHANGES_QUERY_KEY, exchangeId],
		queryFn: () => getGiftExchangeAsAdmin({ data: { exchangeId } }),
	})
	if (isLoading) return <LoadingSkeleton />
	if (error || !data || data.kind === 'error') {
		return (
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">{error ? m.admin_exchanges_load_error() : m.admin_exchanges_not_found()}</CardTitle>
				</CardHeader>
				<CardContent>
					<Button asChild variant="outline" size="sm">
						<Link to="/admin/exchanges">{m.admin_exchanges_back()}</Link>
					</Button>
				</CardContent>
			</Card>
		)
	}
	return <GiftExchangePage exchange={data.exchange} />
}
