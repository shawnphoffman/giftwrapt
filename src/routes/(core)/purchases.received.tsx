import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Gift, PackageOpen, PackagePlus } from 'lucide-react'

import type { DependentReceivedSection } from '@/api/received'
import { getReceivedGifts } from '@/api/received'
import DependentAvatar from '@/components/common/dependent-avatar'
import { Badge } from '@/components/ui/badge'
import { formatGifterNames } from '@/lib/gifters'

export const Route = createFileRoute('/(core)/purchases/received')({
	component: ReceivedPage,
})

function ReceivedPage() {
	const { data, isLoading } = useQuery({
		queryKey: ['received-gifts'],
		queryFn: () => getReceivedGifts(),
	})

	const totalGifts =
		(data?.gifts.length ?? 0) +
		(data?.addons.length ?? 0) +
		(data?.dependents ?? []).reduce((sum, d) => sum + d.gifts.length + d.addons.length, 0)

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Received</h1>
					<PackageOpen className="text-cyan-500 wish-page-icon" />
				</div>

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
									<Badge variant="secondary" className="text-xs">
										{data!.gifts.length}
									</Badge>
								</h3>
								<div className="flex flex-col overflow-hidden divide-y rounded-xl bg-card shadow-sm ring-1 ring-foreground/10">
									{data!.gifts.map((gift, i) => (
										<div key={`${gift.itemId}-${i}`} className="flex items-center gap-3 p-3">
											{gift.itemImageUrl && <img src={gift.itemImageUrl} alt="" className="size-10 object-contain rounded shrink-0" />}
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
									<PackagePlus className="size-4" /> Off-List Gifts
									<Badge variant="secondary" className="text-xs">
										{data!.addons.length}
									</Badge>
								</h3>
								<div className="flex flex-col overflow-hidden divide-y rounded-xl bg-card shadow-sm ring-1 ring-foreground/10">
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

						{(data?.dependents ?? []).map(section => (
							<DependentReceivedBlock key={section.dependent.id} section={section} />
						))}
					</>
				)}
			</div>
		</div>
	)
}

function DependentReceivedBlock({ section }: { section: DependentReceivedSection }) {
	const total = section.gifts.length + section.addons.length
	if (total === 0) return null
	return (
		<div className="flex flex-col gap-2 mt-4">
			<h3 className="flex items-center gap-2">
				<DependentAvatar name={section.dependent.name} image={section.dependent.image} size="small" />
				{section.dependent.name}
				<Badge variant="secondary" className="text-xs">
					{total}
				</Badge>
			</h3>
			<div className="flex flex-col overflow-hidden divide-y rounded-xl bg-card shadow-sm ring-1 ring-foreground/10">
				{section.gifts.map((gift, i) => (
					<div key={`g-${gift.itemId}-${i}`} className="flex items-center gap-3 p-3">
						{gift.itemImageUrl && <img src={gift.itemImageUrl} alt="" className="size-10 object-contain rounded shrink-0" />}
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
				{section.addons.map(addon => (
					<div key={`a-${addon.addonId}`} className="flex items-center gap-3 p-3">
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
	)
}
