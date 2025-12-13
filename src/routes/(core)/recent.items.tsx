import { createFileRoute } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'

export const Route = createFileRoute('/(core)/recent/items')({
	component: RecentItemsPage,
})

function RecentItemsPage() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Recent Items</h1>
					<Inbox className="text-purple-500 wish-page-icon" />
				</div>

				{/* CONTENT */}
				<LoadingSkeleton />
			</div>
		</div>
	)
}
