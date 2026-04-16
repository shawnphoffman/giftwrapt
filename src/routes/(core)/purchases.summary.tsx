import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronDown, Gift, Package, ReceiptText } from 'lucide-react'

import { getPurchaseSummary, type PersonSummary } from '@/api/purchases'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export const Route = createFileRoute('/(core)/purchases/summary')({
	loader: () => getPurchaseSummary(),
	component: PurchasesSummaryPage,
})

function PurchasesSummaryPage() {
	const summaries = Route.useLoaderData()

	const grandTotal = summaries.reduce((sum, s) => sum + s.totalSpent, 0)

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Purchase Summary</h1>
					<ReceiptText className="text-orange-500 wish-page-icon" />
				</div>

				{summaries.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-accent">
						No purchases yet.
					</div>
				) : (
					<>
						{/* GRAND TOTAL */}
						<div className="flex items-center justify-between px-3 py-2 border rounded-lg bg-accent">
							<span className="font-medium">Total Spent</span>
							<span className="font-semibold tabular-nums">${grandTotal.toFixed(2)}</span>
						</div>

						{/* PER-PERSON BREAKDOWN */}
						<div className="flex flex-col gap-3">
							{summaries.map(summary => (
								<PersonCard key={summary.userId} summary={summary} />
							))}
						</div>
					</>
				)}

				<div className="text-sm text-muted-foreground">
					<Link to="/purchases" className="hover:underline">
						&larr; View all purchases
					</Link>
				</div>
			</div>
		</div>
	)
}

function PersonCard({ summary }: { summary: PersonSummary }) {
	const displayName = summary.name || summary.email
	const itemCount = summary.claimCount + summary.addonCount

	return (
		<Collapsible>
			<div className="border rounded-lg bg-accent overflow-hidden">
				<CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 text-left">
					<div className="flex items-center gap-2 min-w-0">
						<span className="font-medium truncate">{displayName}</span>
						{summary.partnerName && (
							<span className="text-xs text-muted-foreground">& {summary.partnerName}</span>
						)}
						<Badge variant="secondary" className="text-xs shrink-0">
							{itemCount} {itemCount === 1 ? 'item' : 'items'}
						</Badge>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						<span className="font-semibold tabular-nums">${summary.totalSpent.toFixed(2)}</span>
						<ChevronDown className="size-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
					</div>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="divide-y border-t">
						{summary.items.map((item, i) => (
							<div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
								{item.type === 'claim' ? (
									<Gift className="size-3.5 text-muted-foreground shrink-0" />
								) : (
									<Package className="size-3.5 text-muted-foreground shrink-0" />
								)}
								<span className="flex-1 truncate">{item.title}</span>
								<span className="text-xs text-muted-foreground shrink-0">{item.listName}</span>
								{item.quantity > 1 && (
									<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
										x{item.quantity}
									</Badge>
								)}
								{item.cost != null && (
									<span className="tabular-nums text-xs shrink-0">${item.cost.toFixed(2)}</span>
								)}
							</div>
						))}
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	)
}
