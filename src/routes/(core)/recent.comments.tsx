import { createFileRoute } from '@tanstack/react-router'

import { getRecentConversations } from '@/api/recent'
import { RecentCommentsPageContent } from '@/components/recent/recent-comments-page'

export const Route = createFileRoute('/(core)/recent/comments')({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData({
			queryKey: ['recent', 'conversations'],
			queryFn: () => getRecentConversations(),
			staleTime: 30 * 1000,
		}),
	component: RecentCommentsPage,
})

function RecentCommentsPage() {
	const rows = Route.useLoaderData()
	return <RecentCommentsPageContent rows={rows} />
}
