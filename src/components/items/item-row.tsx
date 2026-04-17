import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ExternalLink, Gift, Lock, Pencil, X } from 'lucide-react'
import { useState } from 'react'
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
import { getDomainFromUrl } from '@/lib/urls'

import { Badge } from '../ui/badge'
import { ClaimGiftDialog } from './claim-gift-dialog'

type Props = {
	item: ItemWithGifts
	hidePriority?: boolean
	/**
	 * When true, this item is blocked by an earlier item in its ordered group.
	 * The Claim button is suppressed in favor of a "Locked" indicator. Any
	 * existing claim the viewer already has is still editable/removable —
	 * locking is forward-only, matching the server-side guard.
	 */
	locked?: boolean
}

export default function ItemRow({ item, hidePriority = false, locked = false }: Props) {
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
	const totalClaimed = item.quantity - remaining
	const fullyClaimed = remaining === 0
	const myClaim = currentUserId ? item.gifts.find(g => g.gifterId === currentUserId) : undefined

	// For edit-mode, the user's own claim's quantity counts as "available to
	// them" — they're not taking an additional slot, just reshaping what
	// they've already taken.
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

	return (
		<div className="flex flex-col w-full gap-2 p-3 hover:bg-muted" id={`item-${item.id}`}>
			<div className="flex flex-col w-full gap-2">
				<div className="flex flex-row items-stretch gap-x-3.5">
					<div className="flex flex-col justify-center flex-1 gap-0.5 overflow-hidden">
						<div className="flex flex-row items-start flex-1 gap-1 overflow-hidden font-medium">
							{!hidePriority && <PriorityIcon priority={item.priority} />}
							{item.url ? (
								<>
									<a
										href={item.url}
										target="_blank"
										rel="noopener noreferrer"
										className="flex flex-col gap-0.5 overflow-hidden hover:underline"
									>
										{item.title}
									</a>
									<ExternalLink />
									<Badge variant="outline" className="flex text-xs text-muted-foreground">
										{getDomainFromUrl(item.url)}
									</Badge>
								</>
							) : (
								<div>{item.title}</div>
							)}
							{item.price && <span className="px-2 text-xs border rounded whitespace-nowrap bg-card w-fit">{item.price}</span>}
							{item.quantity && item.quantity > 1 && (
								<span className="px-2 text-xs border rounded whitespace-nowrap bg-card w-fit">Qty: {item.quantity}</span>
							)}
						</div>
						{item.notes && <MarkdownNotes content={item.notes} className="text-sm text-foreground/75" />}
					</div>
					{item.imageUrl && (
						<div className="flex items-center justify-center">
							<img src={item.imageUrl} alt={item.title} className="object-contain w-16 max-h-16 xs:w-24 xs:max-h-24" />
						</div>
					)}
				</div>
			</div>

			{/* CLAIMS */}
			<div className="flex flex-row items-center flex-wrap gap-2 pt-1">
				{item.gifts.length > 0 && (
					<div className="flex flex-row items-center gap-2 text-xs text-muted-foreground">
						<Gift className="size-3.5" />
						<span>
							{totalClaimed} of {item.quantity} claimed
						</span>
						<div className="flex flex-row items-center gap-1">
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
					</div>
				)}

				<div className="flex flex-row items-center gap-2 ml-auto">
					{myClaim && (
						<>
							<Button size="sm" variant="ghost" onClick={() => setEditDialogOpen(true)} title="Edit your claim">
								<Pencil className="size-4" />
								Edit
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setUnclaimDialogOpen(true)}
								title="Remove your claim"
								className="text-destructive hover:text-destructive"
							>
								<X className="size-4" />
								Unclaim
							</Button>
						</>
					)}
					{fullyClaimed ? (
						myClaim ? (
							<Badge variant="outline" className="text-xs">
								You claimed this
							</Badge>
						) : (
							<Badge variant="outline" className="text-xs">
								Fully claimed
							</Badge>
						)
					) : locked && !myClaim ? (
						<Badge variant="outline" className="text-xs text-muted-foreground" title="Claim the item above first">
							<Lock className="size-3 mr-1" />
							Locked
						</Badge>
					) : (
						<Button size="sm" variant="outline" onClick={() => setClaimDialogOpen(true)}>
							<Gift className="size-4" />
							{myClaim ? 'Claim more' : 'Claim'}
						</Button>
					)}
				</div>
			</div>

			{/* COMMENTS */}
			<ItemComments itemId={item.id} />

			<ClaimGiftDialog
				open={claimDialogOpen}
				onOpenChange={setClaimDialogOpen}
				itemId={item.id}
				itemTitle={item.title}
				remainingQuantity={remaining}
			/>

			{myClaim && editDialogOpen && (
				// Only mount when open so each open re-reads the current claim values
				// into form defaults. useForm captures defaultValues once per mount,
				// so without this the form would go stale after a successful edit.
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
		</div>
	)
}
