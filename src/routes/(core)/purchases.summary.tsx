import { createFileRoute } from '@tanstack/react-router'
import { ReceiptText } from 'lucide-react'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'

export const Route = createFileRoute('/(core)/purchases/summary')({
	component: PurchasesSummaryPage,
})

function PurchasesSummaryPage() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Purchases Summary</h1>
					<ReceiptText className="text-orange-500 wish-page-icon" />
				</div>
				{/* CONTENT */}
				<LoadingSkeleton />
			</div>
		</div>
	)
}
