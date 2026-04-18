import { createFileRoute, Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'

import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/settings/purchases')({
	component: PurchasesSettingsPage,
})

function PurchasesSettingsPage() {
	return (
		<div className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Purchases</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<p className="text-sm text-muted-foreground">
					View and manage your gift purchases and spending.
				</p>
				<div className="flex flex-col gap-2">
					<Link
						to="/purchases"
						className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50"
					>
						<div className="flex-1">
							<div className="font-medium">Purchases</div>
							<div className="text-xs text-muted-foreground">See all items you've claimed and off-list gifts</div>
						</div>
						<ExternalLink className="size-4 text-muted-foreground" />
					</Link>
					<Link
						to="/purchases/summary"
						className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50"
					>
						<div className="flex-1">
							<div className="font-medium">Spending Summary</div>
							<div className="text-xs text-muted-foreground">Breakdown of spending by person with partner grouping</div>
						</div>
						<ExternalLink className="size-4 text-muted-foreground" />
					</Link>
				</div>
			</CardContent>
		</div>
	)
}
