import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { getRecentItems } from '@/api/recent'
import { RecentItemsPageContent } from '@/components/recent/recent-items-page'
import { serializeTimeframe, type TimeframeValue } from '@/lib/timeframe'
import { useRecentItemsSSE } from '@/lib/use-recent-items-sse'

const DEFAULT_TIMEFRAME: TimeframeValue = { kind: 'preset', preset: '60d' }

function recentItemsQueryOptions(timeframe: TimeframeValue) {
	return {
		queryKey: ['recent', 'items', serializeTimeframe(timeframe)] as const,
		queryFn: () => getRecentItems({ data: { timeframe } }),
		staleTime: 30 * 1000,
	}
}

export const Route = createFileRoute('/(core)/recent/items')({
	loader: ({ context }) => context.queryClient.ensureQueryData(recentItemsQueryOptions(DEFAULT_TIMEFRAME)),
	component: RecentItemsPage,
})

function RecentItemsPage() {
	useRecentItemsSSE()
	const [timeframe, setTimeframe] = useState<TimeframeValue>(DEFAULT_TIMEFRAME)
	const { data: items = [] } = useQuery({
		...recentItemsQueryOptions(timeframe),
		placeholderData: keepPreviousData,
	})
	return <RecentItemsPageContent items={items} timeframe={timeframe} onTimeframeChange={setTimeframe} />
}
