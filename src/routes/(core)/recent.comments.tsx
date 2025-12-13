import { createFileRoute } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'

export const Route = createFileRoute('/(core)/recent/comments')({
	component: RecentCommentsPage,
})

function RecentCommentsPage() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Recent Comments</h1>
					<MessagesSquare className="text-teal-500 wish-page-icon" />
				</div>

				{/* CONTENT */}
				<LoadingSkeleton />
			</div>
		</div>
	)
}
