import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ExternalLink, Gift, Lock, Pencil, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { unclaimItemGift } from '@/api/gifts'
import type { ItemWithGifts } from '@/api/lists'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import PriorityIcon from '@/components/common/priority-icon'
import UserAvatar from '@/components/common/user-avatar'
import { ItemComments } from '@/components/items/item-comments'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
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
	const router = useRouter()
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const currentUserId = session?.user.id
	const [claimDialogOpen, setClaimDialogOpen] = useState(false)
	const [editDialogOpen, setEditDialogOpen] = useState(false)
	const [unclaimDialogOpen, setUnclaimDialogOpen] = useState(false)
	const [unclaiming, setUnclaiming] = useState(false)

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

	async function handleUnclaim() {
		if (!myClaim) return
		setUnclaiming(true)
		try {
			const result = await unclaimItemGift({ data: { giftId: myClaim.id } })
			if (result.kind === 'error') {
				switch (result.reason) {
					case 'not-yours':
						toast.error("You can't unclaim someone else's claim.")
						break
					case 'not-found':
						toast.error('This claim no longer exists.')
						break
				}
				return
			}
			toast.success('Claim removed')
			setUnclaimDialogOpen(false)
			queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'grouped'] })
			await router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to remove claim')
		} finally {
			setUnclaiming(false)
		}
	}

	const domain = item.url ? getDomainFromUrl(item.url) : null
	const hasPriorityTab = !grouped && item.priority !== 'normal'

	const trailingBits: Array<ReactNode> = []
	if (item.price) {
		trailingBits.push(<PriceQuantityBadge key="price" price={item.price} quantity={1} hideQuantity />)
	}
	if (item.quantity > 1) {
		trailingBits.push(<QuantityRemainingBadge key="qty" variant="inline-pill" quantity={item.quantity} remaining={remaining} />)
	} else if (fullyClaimed) {
		trailingBits.push(
			<Badge key="status" variant="outline" className="text-xs">
				{myClaim ? 'You claimed this' : 'Fully claimed'}
			</Badge>
		)
	} else if (lockReason && !myClaim) {
		trailingBits.push(
			<Badge
				key="status"
				variant="outline"
				className="text-xs text-muted-foreground"
				title={lockReason === 'order' ? 'Claim the item above first' : 'Someone already claimed an item in this pick-one group'}
			>
				<Lock className="size-3" />
				Locked
			</Badge>
		)
	}
	const trailing = trailingBits.length > 0 ? <div className="flex items-center gap-2">{trailingBits}</div> : null

	const rowInner = (
		<div className="flex flex-col w-full gap-2" id={`item-${item.id}`}>
			{/* DETAILS ROW */}
			<div className="flex flex-row items-stretch gap-3">
				<div className="flex-1 min-w-0 flex flex-col gap-0.5">
					<div className="font-medium leading-tight truncate">
						{item.url ? (
							<a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
								{item.title}
							</a>
						) : (
							item.title
						)}
					</div>
					{domain && (
						<a
							href={item.url!}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-0.5 w-fit"
						>
							{domain} <ExternalLink className="size-3" />
						</a>
					)}
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
							<>
								<Button size="sm" variant="ghost" className="h-7" onClick={() => setEditDialogOpen(true)} title="Edit your claim">
									<Pencil className="size-4" />
									Edit
								</Button>
								<Button
									size="sm"
									variant="ghost"
									className="h-7 text-destructive hover:text-destructive"
									onClick={() => setUnclaimDialogOpen(true)}
									title="Remove your claim"
								>
									<X className="size-4" />
									Unclaim
								</Button>
							</>
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
				<div className="flex items-start gap-2 p-2 ps-4 border-b last:border-b-0">{rowInner}</div>
			) : (
				<div className="relative">
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
					remainingQuantity={remainingForEdit}
				/>
			)}

			<AlertDialog open={unclaimDialogOpen} onOpenChange={setUnclaimDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove your claim on “{item.title}”?</AlertDialogTitle>
						<AlertDialogDescription>
							Your claim will be deleted and the slot will open back up. You can always claim again later if you change your mind.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={unclaiming}>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleUnclaim} disabled={unclaiming}>
							{unclaiming ? 'Removing…' : 'Yes, unclaim'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
