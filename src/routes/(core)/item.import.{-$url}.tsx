import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'

export const Route = createFileRoute('/(core)/item/import/{-$url}')({
	component: ItemImportPage,
})

function ItemImportPage() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-3xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Import Item</h1>
					<Plus className="text-blue-500 wish-page-icon" />
				</div>
				{/* CONTENT */}
				<LoadingSkeleton />
			</div>
		</div>
	)
}
