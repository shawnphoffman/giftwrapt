import { useIsMutating } from '@tanstack/react-query'
import { Copy, Loader2, MoreHorizontal, PackageCheck, PackageX } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { toast } from 'sonner'

import type { ItemWithGifts } from '@/api/lists'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import PriorityIcon from '@/components/common/priority-icon'
import UrlBadge from '@/components/common/url-badge'
import { ItemComments } from '@/components/items/item-comments'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useSession } from '@/lib/auth-client'
import { computeRemainingClaimableQuantity, computeRemainingClaimableQuantityExcluding } from '@/lib/gifts'
import { useToggleItemAvailability } from '@/lib/mutations/toggle-item-availability'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { cn } from '@/lib/utils'

import { ClaimAction } from './claim-action'
import { type ClaimEntry, ClaimUsers } from './claim-users'
import { ItemImage } from './item-image'
import { PriceQuantityBadge } from './price-quantity-badge'
import { QuantityRemainingBadge } from './quantity-remaining-badge'
import { UnavailableBadge } from './unavailable-badge'

export type LockReason = 'order' | 'or'

type Props = {
	item: ItemWithGifts
	/**
	 * When set, this item is blocked by group rules and the Claim button is
	 * suppressed in favor of a "Locked" indicator. 'order' means an earlier
	 * item in the ordered group still has slots open; 'or' means a sibling
	 * in the pick-one group is already claimed. Existing claims remain
	 * editable, locking is forward-only, matching the server-side guards.
	 */
	lockReason?: LockReason
	/**
	 * When true, render without the outer rounded card, priority tab, or
	 * priority ring. Used inside a GroupBlock which owns the priority
	 * indicator for the whole group.
	 */
	grouped?: boolean
}

function ItemRowImpl({ item, lockReason, grouped = false }: Props) {
	const { data: session } = useSession()
	const currentUserId = session?.user.id
	const toggleAvailability = useToggleItemAvailability()
	const isSaving =
		useIsMutating({
			mutationKey: ['updateItem'],
			predicate: m => (m.state.variables as { itemId?: number } | undefined)?.itemId === item.id,
		}) > 0

	const remaining = computeRemainingClaimableQuantity(
		item.quantity,
		item.gifts.map(g => ({ quantity: g.quantity }))
	)
	const fullyClaimed = remaining === 0
	const myClaim = currentUserId ? item.gifts.find(g => g.gifterId === currentUserId) : undefined
	const isUnavailable = item.availability === 'unavailable'
	const hasNoClaims = item.gifts.length === 0
	const canToggleAvailability = !!currentUserId && hasNoClaims

	const handleToggleAvailability = async () => {
		const next = isUnavailable ? 'available' : 'unavailable'
		const result = await toggleAvailability.mutateAsync({ listId: item.listId, itemId: item.id, availability: next })
		if (result.kind === 'ok') {
			toast.success(next === 'unavailable' ? 'Marked as unavailable' : 'Marked as available')
		} else {
			toast.error('Failed to update availability')
		}
	}

	const remainingForEdit = myClaim
		? computeRemainingClaimableQuantityExcluding(
				item.quantity,
				item.gifts.map(g => ({ id: g.id, quantity: g.quantity })),
				myClaim.id
			)
		: remaining

	// Group rule blocks the viewer from claiming. If they already hold a
	// claim, the rule is forward-only so they can still edit, matching the
	// server-side guard.
	const groupLockedForViewer = !!lockReason && !myClaim
	// Visual "done" state — fully claimed (including by the viewer
	// themselves), group-locked, or marked unavailable.
	const dimmed = fullyClaimed || groupLockedForViewer || isUnavailable

	// Hide URL/domain links once the item is "done" for the viewer (fully
	// claimed or group-locked). The link no longer drives an action, so it
	// just adds noise. Unavailable items keep their URL so the viewer can
	// still verify availability on the source site.
	const urlsHidden = fullyClaimed || groupLockedForViewer
	const linkUrl = !urlsHidden ? item.url : null
	const hasPriorityTab = !grouped && item.priority !== 'normal'

	const claimEntries: Array<ClaimEntry> = item.gifts.map(g => ({
		user: { id: g.gifter.id, name: g.gifter.name || g.gifter.email, image: g.gifter.image },
		quantity: g.quantity,
	}))

	const dimmedBadges: Array<ReactNode> = []
	if (item.price) {
		dimmedBadges.push(<PriceQuantityBadge key="price" price={item.price} quantity={1} hideQuantity />)
	}
	dimmedBadges.push(
		<QuantityRemainingBadge
			key="qty"
			variant="inline-pill"
			quantity={item.quantity}
			remaining={remaining}
			youClaimed={!!myClaim}
			lockReason={groupLockedForViewer ? lockReason : undefined}
		/>
	)
	const trailing = (
		<div className="flex items-center gap-2 justify-end whitespace-nowrap">
			<div className={cn('flex items-center gap-2', dimmed && 'opacity-60')}>{dimmedBadges}</div>
			{claimEntries.length > 0 && <ClaimUsers claims={claimEntries} />}
		</div>
	)

	// Mirror ClaimAction's own render decision so we can drop the wrapper
	// row entirely (instead of leaving an empty flex container that still
	// contributes a gap) when there's nothing to render. Unavailable items
	// can still be edited by an existing claimer, but no new claims open.
	const showClaimAction = !!myClaim || (!fullyClaimed && !groupLockedForViewer && !isUnavailable)

	const hasContentRow = !!(item.notes || item.imageUrl || showClaimAction)

	const rowInner = (
		<div className="flex flex-col w-full gap-2 scroll-mt-24" id={`item-${item.id}`}>
			{/* HEADER */}
			<div className="flex items-center gap-2 font-medium leading-tight">
				<span className={cn('truncate min-w-0', dimmed && 'opacity-60')}>{item.title}</span>
				<UrlBadge url={linkUrl} />
				<span className="flex-1" />
				{isSaving && <Loader2 className="size-3.5 shrink-0 text-muted-foreground animate-spin" aria-label="Saving" />}
				{isUnavailable && <UnavailableBadge changedAt={item.availabilityChangedAt} />}
				{currentUserId && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Item actions">
								<MoreHorizontal className="size-5" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => toast.info('Coming soon')}>
								<Copy className="size-4" /> Copy to your list
							</DropdownMenuItem>
							{canToggleAvailability && (
								<DropdownMenuItem onClick={handleToggleAvailability} disabled={toggleAvailability.isPending}>
									{isUnavailable ? (
										<>
											<PackageCheck className="size-4" /> Mark as available
										</>
									) : (
										<>
											<PackageX className="size-4" /> Mark as unavailable
										</>
									)}
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			{/* CONTENT */}
			{hasContentRow && (
				<div className="flex flex-row gap-3">
					<div className={cn('flex-1 min-w-0 flex flex-col gap-0.5', dimmed && 'opacity-60')}>
						{item.notes && <MarkdownNotes content={item.notes} className="text-xs text-foreground/75" />}
					</div>
					{(item.imageUrl || showClaimAction) && (
						<div className="shrink-0 flex flex-col items-end gap-2 justify-between">
							{item.imageUrl && <ItemImage src={item.imageUrl} alt={item.title} className={cn(dimmed && 'opacity-60')} />}
							{showClaimAction && (
								<div className="mt-auto">
									<ClaimAction
										itemId={item.id}
										listId={item.listId}
										itemTitle={item.title}
										itemImageUrl={item.imageUrl}
										itemQuantity={item.quantity}
										remaining={remaining}
										remainingForEdit={remainingForEdit}
										myClaim={myClaim}
										locked={groupLockedForViewer}
									/>
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* COMMENTS */}
			<ItemComments itemId={item.id} commentCount={item.commentCount} trailing={trailing} />
		</div>
	)

	return grouped ? (
		<div className="flex items-start gap-2 p-2 ps-4 border-b last:border-b-0">{rowInner}</div>
	) : (
		<div className="relative">
			{hasPriorityTab && (
				<div
					className={cn(
						'absolute left-0 top-0 h-[calc(100%-4px)] -translate-x-1/2 translate-y-[2px] w-12 rounded-md shadow-sm drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.2)] dark:drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.5)] hidden xs:flex items-center p-1 z-0',
						priorityTabBgClass[item.priority]
					)}
					aria-hidden
				>
					<PriorityIcon priority={item.priority} className="size-4" />
				</div>
			)}
			<div
				className={cn(
					'relative z-10 flex items-start gap-2 p-3 ps-4 ring-1 ring-inset ring-border rounded-lg bg-card shadow-sm',
					priorityRingClass[item.priority]
				)}
			>
				{rowInner}
			</div>
		</div>
	)
}

const ItemRow = memo(ItemRowImpl)
export default ItemRow
