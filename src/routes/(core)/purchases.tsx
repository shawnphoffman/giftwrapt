import { createFileRoute } from '@tanstack/react-router'
import { Receipt } from 'lucide-react'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'

export const Route = createFileRoute('/(core)/purchases')({
	component: PurchasesPage,
})

function PurchasesPage() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">My Purchases</h1>
					<Receipt className="size-22 -left-4 -top-6 text-pink-500 opacity-30 absolute -z-10" />
				</div>
				{/* CONTENT */}
				<LoadingSkeleton />
			</div>
		</div>
	)
}
