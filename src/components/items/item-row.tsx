import { ExternalLink, Gift } from 'lucide-react'
import { useState } from 'react'

import type { ItemWithGifts } from '@/api/lists'
import PriorityIcon from '@/components/common/priority-icon'
import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/auth-client'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'
import { getDomainFromUrl } from '@/lib/urls'

import { Badge } from '../ui/badge'
import { ClaimGiftDialog } from './claim-gift-dialog'

type Props = {
	item: ItemWithGifts
}

export default function ItemRow({ item }: Props) {
	const { data: session } = useSession()
	const currentUserId = session?.user.id
	const [dialogOpen, setDialogOpen] = useState(false)

	const remaining = computeRemainingClaimableQuantity(
		item.quantity,
		// The server already filters archived gifts out of `item.gifts`, so
		// every claim here counts — pass a constant isArchived:false so the
		// helper treats them uniformly.
		item.gifts.map(g => ({ quantity: g.quantity, isArchived: false }))
	)
	const totalClaimed = item.quantity - remaining
	const fullyClaimed = remaining === 0
	const myClaim = currentUserId ? item.gifts.find(g => g.gifterId === currentUserId) : undefined

	return (
		<div className="flex flex-col w-full gap-2 p-3 hover:bg-muted" id={`item-${item.id}`}>
			<div className="flex flex-col w-full gap-2">
				<div className="flex flex-row items-stretch gap-x-3.5">
					<div className="flex flex-col justify-center flex-1 gap-0.5 overflow-hidden">
						<div className="flex flex-row items-start flex-1 gap-1 overflow-hidden font-medium">
							<PriorityIcon priority={item.priority} />
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
						{item.notes && <div className="text-sm text-foreground/75">{item.notes}</div>}
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

				<div className="ml-auto">
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
					) : (
						<Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
							<Gift className="size-4" />
							{myClaim ? 'Claim more' : 'Claim'}
						</Button>
					)}
				</div>
			</div>

			<ClaimGiftDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				itemId={item.id}
				itemTitle={item.title}
				remainingQuantity={remaining}
			/>
		</div>
	)
}
