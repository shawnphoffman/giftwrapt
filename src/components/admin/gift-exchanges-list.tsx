import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Archive } from 'lucide-react'

import type { AdminExchangeSummary } from '@/api/_gift-exchanges-impl'
import { listGiftExchangesAsAdmin } from '@/api/gift-exchanges'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

import { GIFT_EXCHANGES_QUERY_KEY } from './gift-exchange-details-dialog'
import { exchangeMetaLine } from './gift-exchange-text'

export function AdminGiftExchangesList() {
	const { data, isLoading, error } = useQuery({
		queryKey: [...GIFT_EXCHANGES_QUERY_KEY, 'list'],
		queryFn: () => listGiftExchangesAsAdmin(),
	})

	if (isLoading) {
		return (
			<div className="space-y-3">
				{[...Array(3)].map((_, i) => (
					<div key={i} className="flex items-center justify-between gap-3 p-3">
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-3 w-56" />
						</div>
						<Skeleton className="h-5 w-16" />
					</div>
				))}
			</div>
		)
	}
	if (error) return <div className="text-sm text-destructive">{m.admin_exchanges_load_error()}</div>
	return <GiftExchangesListView exchanges={data ?? []} />
}

/** One plain list, running exchanges first, a state badge per row. Shaped like the Users list. */
export function GiftExchangesListView({ exchanges }: { exchanges: ReadonlyArray<AdminExchangeSummary> }) {
	if (exchanges.length === 0) return <div className="text-sm text-muted-foreground">{m.admin_exchanges_empty()}</div>
	return (
		<div className="grid grid-cols-1 divide-y">
			{exchanges.map(exchange => (
				<Link
					key={exchange.id}
					to="/admin/exchanges/$exchangeId"
					params={{ exchangeId: exchange.id }}
					className={cn('flex items-center gap-3 p-3 transition-colors hover:bg-muted/50', exchange.state === 'archived' && 'opacity-60')}
				>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium">{exchange.name}</div>
						<div className="truncate text-xs text-muted-foreground">{exchangeMetaLine(exchange, exchange.memberCount)}</div>
					</div>
					<ExchangeStateBadge state={exchange.state} />
				</Link>
			))}
		</div>
	)
}

export function ExchangeStateBadge({ state }: { state: AdminExchangeSummary['state'] }) {
	switch (state) {
		case 'archived':
			return (
				<Badge variant="outline" className="shrink-0 gap-1 text-xs text-muted-foreground">
					<Archive className="size-3" />
					{m.admin_exchanges_state_archived()}
				</Badge>
			)
		case 'drawn':
			return (
				<Badge variant="default" className="shrink-0 text-xs">
					{m.admin_exchanges_state_drawn()}
				</Badge>
			)
		case 'not-drawn':
			return (
				<Badge variant="secondary" className="shrink-0 text-xs">
					{m.admin_exchanges_state_not_drawn()}
				</Badge>
			)
	}
}
