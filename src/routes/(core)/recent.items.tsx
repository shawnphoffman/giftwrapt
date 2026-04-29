import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { getRecentItems } from '@/api/recent'
import { RecentItemsPageContent } from '@/components/recent/recent-items-page'

const recentItemsQueryOptions = {
	queryKey: ['recent', 'items'] as const,
	queryFn: () => getRecentItems(),
	staleTime: 30 * 1000,
}

export const Route = createFileRoute('/(core)/recent/items')({
	loader: ({ context }) => context.queryClient.ensureQueryData(recentItemsQueryOptions),
	component: RecentItemsPage,
})

function RecentItemsPage() {
	const { data: items } = useSuspenseQuery(recentItemsQueryOptions)
	return <RecentItemsPageContent items={items} />
}
