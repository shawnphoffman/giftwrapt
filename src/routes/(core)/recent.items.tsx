import { createFileRoute } from '@tanstack/react-router'

import { getRecentItems } from '@/api/recent'
import { RecentItemsPageContent } from '@/components/recent/recent-items-page'

export const Route = createFileRoute('/(core)/recent/items')({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData({
			queryKey: ['recent', 'items'],
			queryFn: () => getRecentItems(),
			staleTime: 30 * 1000,
		}),
	component: RecentItemsPage,
})

function RecentItemsPage() {
	const items = Route.useLoaderData()
	return <RecentItemsPageContent items={items} />
}
