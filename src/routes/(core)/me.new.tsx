import { createFileRoute } from '@tanstack/react-router'
import { ListPlus } from 'lucide-react'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'

export const Route = createFileRoute('/(core)/me/new')({
	component: NewListPage,
})

function NewListPage() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Create New List</h1>
					<ListPlus className="text-yellow-500 wish-page-icon" />
				</div>
				{/* CONTENT */}
				<LoadingSkeleton />
			</div>
		</div>
	)
}
