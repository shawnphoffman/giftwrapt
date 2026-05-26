import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { getRecentConversations } from '@/api/recent'
import { RecentCommentsPageContent } from '@/components/recent/recent-comments-page'
import { serializeTimeframe, type TimeframeValue } from '@/lib/timeframe'
import { useRecentCommentsSSE } from '@/lib/use-recent-comments-sse'

const DEFAULT_TIMEFRAME: TimeframeValue = { kind: 'preset', preset: '60d' }

function recentConversationsQueryOptions(timeframe: TimeframeValue) {
	return {
		queryKey: ['recent', 'conversations', serializeTimeframe(timeframe)] as const,
		queryFn: () => getRecentConversations({ data: { timeframe } }),
		staleTime: 30 * 1000,
	}
}

export const Route = createFileRoute('/(core)/recent/comments')({
	loader: ({ context }) => context.queryClient.ensureQueryData(recentConversationsQueryOptions(DEFAULT_TIMEFRAME)),
	component: RecentCommentsPage,
})

function RecentCommentsPage() {
	useRecentCommentsSSE()
	const [timeframe, setTimeframe] = useState<TimeframeValue>(DEFAULT_TIMEFRAME)
	const { data: rows = [] } = useQuery({
		...recentConversationsQueryOptions(timeframe),
		placeholderData: keepPreviousData,
	})
	return <RecentCommentsPageContent rows={rows} timeframe={timeframe} onTimeframeChange={setTimeframe} />
}
