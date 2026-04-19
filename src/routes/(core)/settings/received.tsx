import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Gift, Package } from 'lucide-react'

import { getReceivedGifts } from '@/api/received'
import { Badge } from '@/components/ui/badge'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatGifterNames } from '@/lib/gifters'

export const Route = createFileRoute('/(core)/settings/received')({
	component: ReceivedPage,
})

function ReceivedPage() {
	const { data, isLoading } = useQuery({
		queryKey: ['received-gifts'],
		queryFn: () => getReceivedGifts(),
	})

	const totalGifts = (data?.gifts.length ?? 0) + (data?.addons.length ?? 0)

	return (
		<div className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Received Gifts</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<p className="text-sm text-muted-foreground">
					Items that have been archived on your lists. Once archived, you can see who gifted each item.
				</p>

				{isLoading ? (
					<div className="text-sm text-muted-foreground">Loading...</div>
				) : totalGifts === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						No received gifts yet. Items will appear here after they are archived.
					</div>
				) : (
					<>
						{data!.gifts.length > 0 && (
							<div className="flex flex-col gap-2">
								<h3 className="flex items-center gap-2">
									<Gift className="size-4" /> Items
									<Badge variant="secondary" className="text-xs">{data!.gifts.length}</Badge>
								</h3>
								<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
									{data!.gifts.map((gift, i) => (
										<div key={`${gift.itemId}-${i}`} className="flex items-center gap-3 p-3">
											{gift.itemImageUrl && (
												<img src={gift.itemImageUrl} alt="" className="size-10 object-contain rounded shrink-0" />
											)}
											<div className="flex-1 min-w-0">
												<div className="font-medium leading-tight truncate">{gift.itemTitle}</div>
												<div className="text-xs text-muted-foreground">
													From {formatGifterNames(gift.gifterNames)} &middot; {gift.listName}
												</div>
											</div>
											{gift.quantity > 1 && (
												<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
													x{gift.quantity}
												</Badge>
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{data!.addons.length > 0 && (
							<div className="flex flex-col gap-2">
								<h3 className="flex items-center gap-2">
									<Package className="size-4" /> Off-List Gifts
									<Badge variant="secondary" className="text-xs">{data!.addons.length}</Badge>
								</h3>
								<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
									{data!.addons.map(addon => (
										<div key={addon.addonId} className="flex items-center gap-3 p-3">
											<div className="flex-1 min-w-0">
												<div className="font-medium leading-tight truncate">{addon.description}</div>
												<div className="text-xs text-muted-foreground">
													From {formatGifterNames(addon.gifterNames)} &middot; {addon.listName}
												</div>
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					</>
				)}
			</CardContent>
		</div>
	)
}
