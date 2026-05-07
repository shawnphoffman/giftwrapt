import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { getRecentConversations } from '@/api/recent'
import { RecentCommentsPageContent } from '@/components/recent/recent-comments-page'
import { useRecentCommentsSSE } from '@/lib/use-recent-comments-sse'

const recentConversationsQueryOptions = {
	queryKey: ['recent', 'conversations'] as const,
	queryFn: () => getRecentConversations(),
	staleTime: 30 * 1000,
}

export const Route = createFileRoute('/(core)/recent/comments')({
	loader: ({ context }) => context.queryClient.ensureQueryData(recentConversationsQueryOptions),
	component: RecentCommentsPage,
})

function RecentCommentsPage() {
	useRecentCommentsSSE()
	const { data: rows } = useSuspenseQuery(recentConversationsQueryOptions)
	return <RecentCommentsPageContent rows={rows} />
}
