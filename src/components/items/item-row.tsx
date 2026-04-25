import { ExternalLink, Gift, Lock, Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import type { ItemWithGifts } from '@/api/lists'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import PriorityIcon from '@/components/common/priority-icon'
import UserAvatar from '@/components/common/user-avatar'
import { ItemComments } from '@/components/items/item-comments'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSession } from '@/lib/auth-client'
import { computeRemainingClaimableQuantity, computeRemainingClaimableQuantityExcluding } from '@/lib/gifts'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { getDomainFromUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

import { Badge } from '../ui/badge'
import { ClaimGiftDialog } from './claim-gift-dialog'
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
	const [claimDialogOpen, setClaimDialogOpen] = useState(false)
	const [editDialogOpen, setEditDialogOpen] = useState(false)

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

	const lockLabel = fullyClaimedByOthers ? 'Fully claimed' : 'Locked'
	const lockExplanation = fullyClaimedByOthers
		? 'Someone has already claimed this item.'
		: lockReason === 'order'
			? 'Claim the item above this one first to unlock it.'
			: 'Someone already claimed an item in this pick-one group.'

	const domain = item.url ? getDomainFromUrl(item.url) : null
	const hasPriorityTab = !grouped && item.priority !== 'normal'

	const trailingBits: Array<ReactNode> = []
	if (item.price) {
		trailingBits.push(<PriceQuantityBadge key="price" price={item.price} quantity={1} hideQuantity />)
	}
	if (item.quantity > 1) {
		trailingBits.push(<QuantityRemainingBadge key="qty" variant="inline-pill" quantity={item.quantity} remaining={remaining} />)
	}
	if (isLocked) {
		trailingBits.push(<LockedIndicator key="status" label={lockLabel} explanation={lockExplanation} />)
	} else if (item.quantity <= 1 && fullyClaimed && myClaim) {
		trailingBits.push(
			<Badge key="status" variant="outline" className="text-xs">
				You claimed this
			</Badge>
		)
	}
	const trailing = trailingBits.length > 0 ? <div className="flex items-center gap-2">{trailingBits}</div> : null

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

			{/* CLAIMS ROW */}
			{(item.gifts.length > 0 || !fullyClaimed) && (
				<div className="flex flex-row items-center flex-wrap gap-2">
					{item.gifts.length > 0 && (
						<div className="flex flex-row flex-wrap items-center gap-1 text-xs text-muted-foreground">
							{item.gifts.map(gift => {
								const name = gift.gifter.name || gift.gifter.email
								const isMe = gift.gifter.id === currentUserId
								return (
									<span
										key={gift.id}
										className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-card border"
										title={`${name} · ${gift.quantity}`}
									>
										<UserAvatar name={name} image={gift.gifter.image} size="small" />
										<span>
											{isMe ? 'You' : name}
											{gift.quantity > 1 && ` (${gift.quantity})`}
										</span>
									</span>
								)
							})}
						</div>
					)}

					<div className="flex flex-row items-center gap-1 ml-auto">
						{myClaim && (
							<Button size="sm" variant="ghost" className="h-7" onClick={() => setEditDialogOpen(true)} title="Edit your claim">
								<Pencil className="size-4" />
								Edit claim
							</Button>
						)}
						{!fullyClaimed && (!lockReason || myClaim) && (
							<Button size="sm" variant="outline" className="h-7" onClick={() => setClaimDialogOpen(true)}>
								<Gift className="size-4" />
								{myClaim ? 'Claim more' : 'Claim'}
							</Button>
						)}
					</div>
				</div>
			)}

			{/* COMMENTS */}
			<ItemComments itemId={item.id} commentCount={item.commentCount} trailing={trailing} />
		</div>
	)

	return (
		<>
			{grouped ? (
				<div className={cn('flex items-start gap-2 p-2 ps-4 border-b last:border-b-0', isLocked && 'opacity-60')}>{rowInner}</div>
			) : (
				<div className={cn('relative', isLocked && 'opacity-60')}>
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
			)}

			<ClaimGiftDialog
				open={claimDialogOpen}
				onOpenChange={setClaimDialogOpen}
				itemId={item.id}
				itemTitle={item.title}
				itemImageUrl={item.imageUrl}
				itemQuantity={item.quantity}
				remainingQuantity={remaining}
			/>

			{myClaim && editDialogOpen && (
				<ClaimGiftDialog
					mode="edit"
					gift={myClaim}
					open={editDialogOpen}
					onOpenChange={setEditDialogOpen}
					itemId={item.id}
					itemTitle={item.title}
					itemImageUrl={item.imageUrl}
					itemQuantity={item.quantity}
					remainingQuantity={remainingForEdit}
				/>
			)}
		</>
	)
}

function LockedIndicator({ label, explanation }: { label: string; explanation: string }) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="inline-flex items-center gap-1 rounded-full border bg-transparent px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Lock className="size-3" />
					{label}
				</button>
			</PopoverTrigger>
			<PopoverContent side="top" align="end" className="w-auto max-w-xs text-xs leading-relaxed">
				{explanation}
			</PopoverContent>
		</Popover>
	)
}
