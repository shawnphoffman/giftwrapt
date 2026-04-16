import { createFileRoute, Link } from '@tanstack/react-router'
import { ExternalLink, Gift, Package, Receipt } from 'lucide-react'

import { getMyPurchases } from '@/api/purchases'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/(core)/purchases/')({
	loader: () => getMyPurchases(),
	component: PurchasesPage,
})

function PurchasesPage() {
	const { claims, addons } = Route.useLoaderData()
	const totalClaims = claims.length
	const totalAddons = addons.length

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">My Purchases</h1>
					<Receipt className="text-pink-500 wish-page-icon" />
				</div>

				{totalClaims === 0 && totalAddons === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-accent">
						No purchases yet. Claim items from other people's lists to see them here.
					</div>
				) : (
					<>
						{/* CLAIMS */}
						{totalClaims > 0 && (
							<div className="flex flex-col gap-2">
								<h3 className="flex items-center gap-2">
									<Gift className="size-4" /> Claimed Items
									<Badge variant="secondary" className="text-xs">{totalClaims}</Badge>
								</h3>
								<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
									{claims.map(claim => (
										<div key={claim.giftId} className="flex items-center gap-3 p-3">
											<div className="flex-1 min-w-0">
												<div className="font-medium leading-tight truncate">{claim.itemTitle}</div>
												<div className="text-xs text-muted-foreground">
													For {claim.listOwnerName || claim.listOwnerEmail} &middot; {claim.listName}
												</div>
											</div>
											{claim.itemUrl && (
												<a
													href={claim.itemUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="text-muted-foreground hover:text-foreground shrink-0"
												>
													<ExternalLink className="size-4" />
												</a>
											)}
											{claim.quantity > 1 && (
												<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
													x{claim.quantity}
												</Badge>
											)}
											{claim.totalCost && (
												<Badge variant="outline" className="text-xs tabular-nums shrink-0">
													${claim.totalCost}
												</Badge>
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{/* ADDONS */}
						{totalAddons > 0 && (
							<div className="flex flex-col gap-2">
								<h3 className="flex items-center gap-2">
									<Package className="size-4" /> Off-List Gifts
									<Badge variant="secondary" className="text-xs">{totalAddons}</Badge>
								</h3>
								<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
									{addons.map(addon => (
										<div key={addon.addonId} className="flex items-center gap-3 p-3">
											<div className="flex-1 min-w-0">
												<div className="font-medium leading-tight truncate">{addon.description}</div>
												<div className="text-xs text-muted-foreground">
													For {addon.listOwnerName || addon.listOwnerEmail} &middot; {addon.listName}
													{addon.isArchived && ' (given)'}
												</div>
											</div>
											{addon.totalCost && (
												<Badge variant="outline" className="text-xs tabular-nums shrink-0">
													${addon.totalCost}
												</Badge>
											)}
										</div>
									))}
								</div>
							</div>
						)}
					</>
				)}

				<div className="text-sm text-muted-foreground">
					<Link to="/purchases/summary" className="hover:underline">
						View spending summary by person &rarr;
					</Link>
				</div>
			</div>
		</div>
	)
}
