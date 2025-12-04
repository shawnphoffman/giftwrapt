import { createFileRoute } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'

export const Route = createFileRoute('/(core)/recent/items')({
	component: RecentItemsPage,
})

function RecentItemsPage() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Create New List</h1>
					<Inbox className="size-18 text-purple-500 opacity-30 absolute left-4 -top-4 -z-10" />
				</div>

				{/* CONTENT */}
				<LoadingSkeleton />
			</div>
		</div>
	)
}
