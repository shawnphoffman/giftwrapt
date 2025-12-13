import { createFileRoute } from '@tanstack/react-router'
import { Receipt } from 'lucide-react'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'

export const Route = createFileRoute('/(core)/purchases/')({
	component: PurchasesPage,
})

function PurchasesPage() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">My Purchases</h1>
					<Receipt className="text-pink-500 wish-page-icon" />
				</div>
				{/* CONTENT */}
				<LoadingSkeleton />
			</div>
		</div>
	)
}
