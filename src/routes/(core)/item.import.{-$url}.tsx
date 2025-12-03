import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

export const Route = createFileRoute('/(core)/item/import/{-$url}')({
	component: ItemImportPage,
})

function ItemImportPage() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Import Item</h1>
					<Plus className="size-18 text-blue-500 opacity-30 absolute left-4 -top-4 -z-10" />
				</div>
				{/* CONTENT */}
				<LoadingSkeleton />
			</div>
		</div>
	)
}
