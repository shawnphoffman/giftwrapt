import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'

import type { ItemWithGifts } from '@/api/lists'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import PriorityIcon from '@/components/common/priority-icon'
import { ItemComments } from '@/components/items/item-comments'
import { useSession } from '@/lib/auth-client'
import { computeRemainingClaimableQuantity, computeRemainingClaimableQuantityExcluding } from '@/lib/gifts'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { getDomainFromUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

import { ClaimAction } from './claim-action'
import { type ClaimEntry, ClaimUsers } from './claim-users'
import { ItemImage } from './item-image'
import { PriceQuantityBadge } from './price-quantity-badge'
import { QuantityRemainingBadge } from './quantity-remaining-badge'

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

export default function ItemRow({ item, lockReason, grouped = false }: Props) {
	const { data: session } = useSession()
	const currentUserId = session?.user.id

	const remaining = computeRemainingClaimableQuantity(
		item.quantity,
		item.gifts.map(g => ({ quantity: g.quantity }))
	)
	const fullyClaimed = remaining === 0
	const myClaim = currentUserId ? item.gifts.find(g => g.gifterId === currentUserId) : undefined

	const remainingForEdit = myClaim
		? computeRemainingClaimableQuantityExcluding(
				item.quantity,
				item.gifts.map(g => ({ id: g.id, quantity: g.quantity })),
				myClaim.id
			)
		: remaining

	// "Locked for the current viewer" covers everything that hides the
	// Claim button: a group rule blocks them, or someone else has already
	// taken every slot. If the viewer has their own claim they can still
	// edit it, so we don't treat that as locked.
	const fullyClaimedByOthers = fullyClaimed && !myClaim
	const groupLockedForViewer = !!lockReason && !myClaim
	const isLocked = fullyClaimedByOthers || groupLockedForViewer
	// Visual "done" state. Includes the case where the viewer holds one of
	// the claims, which isLocked excludes so URL links etc. stay active.
	const dimmed = fullyClaimed || groupLockedForViewer

	const domain = item.url ? getDomainFromUrl(item.url) : null
	const hasPriorityTab = !grouped && item.priority !== 'normal'

	const claimEntries: Array<ClaimEntry> = item.gifts.map(g => ({
		user: { id: g.gifter.id, name: g.gifter.name || g.gifter.email, image: g.gifter.image },
		quantity: g.quantity,
	}))

	const trailingBits: Array<ReactNode> = []
	if (item.price) {
		trailingBits.push(<PriceQuantityBadge key="price" price={item.price} quantity={1} hideQuantity />)
	}
	trailingBits.push(
		<QuantityRemainingBadge
			key="qty"
			variant="inline-pill"
			quantity={item.quantity}
			remaining={remaining}
			youClaimed={!!myClaim}
			lockReason={groupLockedForViewer ? lockReason : undefined}
		/>
	)
	if (claimEntries.length > 0) {
		trailingBits.push(<ClaimUsers key="claimers" claims={claimEntries} />)
	}
	const trailing = <div className="flex items-center gap-2 justify-end whitespace-nowrap">{trailingBits}</div>

	// Mirror ClaimAction's own render decision so we can drop the wrapper
	// row entirely (instead of leaving an empty flex container that still
	// contributes a gap) when there's nothing to render.
	const showClaimAction = !!myClaim || (!fullyClaimed && !groupLockedForViewer)

	const rowInner = (
		<div className="flex flex-col w-full gap-2 scroll-mt-24" id={`item-${item.id}`}>
			{/* DETAILS ROW */}
			<div className="flex flex-row items-start gap-3">
				<div className="flex-1 min-w-0 flex flex-col gap-0.5">
					<div className="font-medium leading-tight truncate">
						{item.url && !isLocked ? (
							<a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
								{item.title}
							</a>
						) : (
							item.title
						)}
					</div>
					{domain &&
						(isLocked ? (
							<span className="text-xs text-muted-foreground inline-flex items-center w-fit">{domain}</span>
						) : (
							<a
								href={item.url!}
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-0.5 w-fit"
							>
								{domain} <ExternalLink className="size-3" />
							</a>
						))}
					{item.notes && <MarkdownNotes content={item.notes} className="text-xs text-foreground/75 mt-1" />}
				</div>
				{item.imageUrl && <ItemImage src={item.imageUrl} alt={item.title} />}
			</div>

			{showClaimAction && (
				<div className="flex justify-end">
					<ClaimAction
						itemId={item.id}
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

			{/* COMMENTS */}
			<ItemComments itemId={item.id} commentCount={item.commentCount} trailing={trailing} />
		</div>
	)

	return grouped ? (
		<div className={cn('flex items-start gap-2 p-2 ps-4 border-b last:border-b-0', dimmed && 'text-muted-foreground')}>{rowInner}</div>
	) : (
		<div className={cn('relative', dimmed && 'text-muted-foreground')}>
			{hasPriorityTab && (
				<div
					className={cn(
						'absolute left-0 top-0 h-[calc(100%-4px)] -translate-x-1/2 translate-y-[2px] w-12 rounded-md shadow-sm flex items-center p-1 z-0',
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
