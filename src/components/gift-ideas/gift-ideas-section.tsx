import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleHelp } from 'lucide-react'
import { useState } from 'react'

import type { GiftIdeasSource } from '@/api/gift-ideas'
import type { ItemWithGifts } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import UserAvatar from '@/components/common/user-avatar'
import ItemRow from '@/components/items/item-row'
import { ListAddonDialog, type ListAddonInitialValues } from '@/components/list-addons/list-addon-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { listGiftIdeasQueryOptions } from '@/lib/queries/lists'
import { LIMITS } from '@/lib/validation/limits'

// Gift ideas for this list's recipient, from gift-ideas lists the viewer owns
// or edits (plan 18b). Claiming an idea copies it into an off-list gift on
// this list and deletes the idea; there's no link back.

type SectionProps = {
	listId: number
	recipientName: string
	sources: Array<GiftIdeasSource>
}

// Fetches and renders the section. Renders nothing while loading, on error,
// or when there are no ideas: most viewers have no ideas list for the
// recipient, so a skeleton would flash and collapse on nearly every visit.
export function GiftIdeasOnList({ listId, recipientName }: { listId: number; recipientName: string }) {
	const { data: sources } = useQuery(listGiftIdeasQueryOptions(listId))
	if (!sources || sources.length === 0) return null
	return <GiftIdeasSection listId={listId} recipientName={recipientName} sources={sources} />
}

export function GiftIdeasSection({ listId, recipientName, sources }: SectionProps) {
	const [claiming, setClaiming] = useState<ItemWithGifts | null>(null)
	const nonEmpty = sources.filter(s => s.items.length > 0)
	if (nonEmpty.length === 0) return null

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-1.5">
				<h2 className="text-lg font-semibold">Gift Ideas</h2>
				<Popover>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label="About gift ideas"
							className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<CircleHelp className="size-4" />
						</button>
					</PopoverTrigger>
					<PopoverContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
						Ideas from your gift-ideas lists for {recipientName}. Only you and the other editors of those lists can see them, and{' '}
						{recipientName} never can. Claiming an idea adds it to Off-List Gifts on this list and removes it from your ideas.
					</PopoverContent>
				</Popover>
			</div>

			<div className="flex flex-col gap-4">
				{nonEmpty.map(source => (
					<GiftIdeasSourceGroup key={source.list.id} source={source} onClaim={setClaiming} />
				))}
			</div>

			{claiming && (
				<ListAddonDialog
					open
					onOpenChange={open => {
						if (!open) setClaiming(null)
					}}
					listId={listId}
					fromIdea={{ ideaItemId: claiming.id }}
					initialValues={ideaToAddonValues(claiming)}
				/>
			)}
		</div>
	)
}

function GiftIdeasSourceGroup({ source, onClaim }: { source: GiftIdeasSource; onClaim: (item: ItemWithGifts) => void }) {
	const ownerName = source.owner.name || source.owner.email
	return (
		<div className="flex flex-col gap-2">
			<div className="xs:pl-6 flex items-center gap-1.5 min-w-0 text-sm text-muted-foreground">
				<ListTypeIcon type="giftideas" className="size-4 shrink-0" />
				<Link
					to="/lists/$listId/edit"
					params={{ listId: String(source.list.id) }}
					className="font-medium text-foreground truncate min-w-0 hover:underline"
				>
					{source.list.name}
				</Link>
				{!source.viewerIsOwner && (
					<span className="flex items-center gap-1 shrink-0">
						<span aria-hidden>·</span>
						<UserAvatar name={ownerName} image={source.owner.image} size="small" className="size-4" />
						<span className="hidden xs:inline">{ownerName}'s list</span>
					</span>
				)}
			</div>
			{source.items.map(item => (
				<div key={item.id} className="xs:pl-6">
					<ItemRow item={item} giftIdea={{ onClaim: () => onClaim(item) }} />
				</div>
			))}
		</div>
	)
}

// Prefill for the claim dialog. Item prices are free-form ("$28", "12 each"),
// so only a clean amount carries into Total cost; notes are trimmed to the
// addon limit (the dialog shows exactly what will be saved).
export function ideaToAddonValues(item: ItemWithGifts): ListAddonInitialValues {
	const amount = item.price ? Number.parseFloat(item.price.replace(/[^0-9.]/g, '')) : Number.NaN
	return {
		description: item.title.slice(0, LIMITS.SHORT_TEXT),
		notes: (item.notes ?? '').slice(0, LIMITS.MEDIUM_TEXT),
		totalCost: Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : '',
		url: item.url ?? '',
		imageUrl: item.imageUrl ?? '',
	}
}
