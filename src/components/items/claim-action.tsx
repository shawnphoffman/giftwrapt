import { Gift, Pencil } from 'lucide-react'
import { useState } from 'react'

import type { GiftOnItem } from '@/api/lists'
import { Button } from '@/components/ui/button'

import { ClaimGiftDialog } from './claim-gift-dialog'

type Props = {
	itemId: number
	itemTitle: string
	itemImageUrl?: string | null
	itemQuantity: number
	/**
	 * Slots remaining if no claim were taken into account, i.e.
	 * `quantity - sum(all claims)`. Drives the "can a new claimer claim?"
	 * decision and is the budget passed to ClaimGiftDialog in create mode.
	 */
	remaining: number
	/**
	 * Slots remaining for the existing claimer, i.e.
	 * `quantity - sum(OTHER claims)`. Equal to `remaining` when there is no
	 * existing claim. ClaimGiftDialog uses this in edit mode so the
	 * claimer's own quantity is part of their adjustable budget.
	 */
	remainingForEdit: number
	/**
	 * The viewer's existing claim on this item, if any. When set, the
	 * action becomes "Edit claim"; otherwise it's "Claim".
	 */
	myClaim?: GiftOnItem
	/**
	 * When set and the viewer has no existing claim, the action is
	 * suppressed because a group rule blocks them from claiming. Existing
	 * claims remain editable, matching the server-side guards.
	 */
	locked?: boolean
}

/**
 * Single entry point for the viewer's claim action: renders "Claim" for
 * a new claimer, "Edit claim" for an existing claimer, or nothing when
 * the viewer is blocked (fully claimed by others, group-locked without a
 * claim). Owns the dialog state for both flows so callers don't have to
 * juggle two `useState`s and two `<ClaimGiftDialog>` instances.
 */
export function ClaimAction({
	itemId,
	itemTitle,
	itemImageUrl,
	itemQuantity,
	remaining,
	remainingForEdit,
	myClaim,
	locked = false,
}: Props) {
	const [createOpen, setCreateOpen] = useState(false)
	const [editOpen, setEditOpen] = useState(false)

	const fullyClaimed = remaining === 0
	if (myClaim) {
		return (
			<>
				<Button size="sm" variant="outline" className="h-7" onClick={() => setEditOpen(true)} title="Edit your claim">
					<Pencil className="size-3.5" />
					Edit claim
				</Button>
				{editOpen && (
					<ClaimGiftDialog
						mode="edit"
						gift={myClaim}
						open={editOpen}
						onOpenChange={setEditOpen}
						itemId={itemId}
						itemTitle={itemTitle}
						itemImageUrl={itemImageUrl}
						itemQuantity={itemQuantity}
						remainingQuantity={remainingForEdit}
					/>
				)}
			</>
		)
	}

	if (fullyClaimed || locked) return null

	return (
		<>
			<Button size="sm" variant="outline" className="h-7" onClick={() => setCreateOpen(true)}>
				<Gift className="size-3.5" />
				Claim
			</Button>
			<ClaimGiftDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				itemId={itemId}
				itemTitle={itemTitle}
				itemImageUrl={itemImageUrl}
				itemQuantity={itemQuantity}
				remainingQuantity={remaining}
			/>
		</>
	)
}
