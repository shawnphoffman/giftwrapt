import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { DollarSign, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { claimItemGift, getAddableCoGifters, unclaimItemGift, updateCoGifters, updateItemGift } from '@/api/gifts'
import type { GiftOnItem } from '@/api/lists'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { RemoteImage } from '@/components/common/remote-image'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { errorText } from '@/lib/i18n/errors'
import { normalizeAmountInput } from '@/lib/i18n/format'
import { zodIssuesText, zodParams } from '@/lib/i18n/zod'
import { applyListEventLocally } from '@/lib/list-events'
import { LIMITS } from '@/lib/validation/limits'
import { m } from '@/paraglide/messages.js'

import { QuantityRemainingBadge } from './quantity-remaining-badge'

type BaseProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	itemId: number
	listId: number
	itemTitle: string
	itemImageUrl?: string | null
	itemQuantity: number
	// For create mode: remaining = item.quantity - sum(all claims).
	// For edit mode:   remaining = item.quantity - sum(OTHER claims), so the
	// current claim's own quantity is part of the budget the user can spend.
	remainingQuantity: number
	/** Unclamped sum of every claim quantity, used by the badge to detect over-claim. */
	claimedCount?: number
	/** Item availability is 'unavailable'; surfaces in the dialog header badge. */
	unavailable?: boolean
	unavailableChangedAt?: Date | string | null
}

type CreateProps = BaseProps & {
	mode?: 'create'
	gift?: never
	/** Fires after a successful new claim. Drives the success celebration. */
	onClaimed?: () => void
}
type EditProps = BaseProps & { mode: 'edit'; gift: GiftOnItem; onClaimed?: never }

type Props = CreateProps | EditProps

function getErrorMessage(errors: Array<unknown>): string {
	return errors
		.map(err => {
			if (typeof err === 'string') return err
			if (err && typeof err === 'object' && 'message' in err) return (err as { message: string }).message
			return String(err)
		})
		.join(', ')
}

// Matches the server-side schema shape. Duplicated deliberately - zod types
// don't cross the server/client boundary cleanly, and the UX constraints
// (max capped to remainingQuantity) differ from the server-side guard
// (which enforces the invariant under a row lock).
function buildSchema(remaining: number) {
	return z.object({
		quantity: z.coerce
			.number()
			.int()
			.positive(m.items_claim_error_quantity_min())
			.max(remaining, m.items_claim_error_only_left({ remaining })),
		notes: z.string().max(LIMITS.MEDIUM_TEXT, m.items_claim_error_notes_too_long()).optional(),
		totalCost: z
			.string()
			.trim()
			.optional()
			.transform(v => (v ? normalizeAmountInput(v) : v))
			.refine(v => !v || /^\d+(\.\d{1,2})?$/.test(v), {
				message: m.items_claim_error_cost_format(),
			}),
	})
}

export function ClaimGiftDialog(props: Props) {
	const {
		open,
		onOpenChange,
		itemId,
		listId,
		itemTitle,
		itemImageUrl,
		itemQuantity,
		remainingQuantity,
		claimedCount,
		unavailable,
		unavailableChangedAt,
	} = props
	const isEdit = props.mode === 'edit'
	const router = useRouter()
	const queryClient = useQueryClient()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [coGifterIds, setCoGifterIds] = useState<Array<string>>(isEdit ? (props.gift.additionalGifterIds ?? []) : [])
	const [coGifterSaving, setCoGifterSaving] = useState(false)
	const [unclaimConfirmOpen, setUnclaimConfirmOpen] = useState(false)

	const editGiftId = props.mode === 'edit' ? props.gift.id : null
	const { data: allUsers } = useQuery({
		queryKey: ['addable-co-gifters', editGiftId],
		queryFn: () => getAddableCoGifters({ data: { giftId: editGiftId! } }),
		enabled: open && isEdit,
		staleTime: 5 * 60 * 1000,
	})

	async function handleUnclaim() {
		if (!isEdit) return
		const result = await unclaimItemGift({ data: { giftId: props.gift.id } })
		if (result.kind === 'error') {
			switch (result.reason) {
				case 'not-yours':
					toast.error(m.items_claim_unclaim_error_not_yours())
					break
				case 'not-found':
					toast.error(m.items_claim_error_not_found())
					break
			}
			throw new Error(result.reason)
		}
		toast.success(m.items_claim_toast_removed())
		// Refresh the claimant's own surfaces immediately. SSE only reaches
		// observers sharing the server process (not Vercel), so the actor's
		// view must invalidate locally - otherwise it's stale until reload.
		applyListEventLocally({ kind: 'claim', listId }, { queryClient, router })
		onOpenChange(false)
	}

	// In edit mode, allow at least the existing claim's current quantity even
	// when remainingQuantity is 0. This handles the over-claim case (recipient
	// lowered items.quantity below sum(claims) without knowing claims existed):
	// without this, an existing claimer can't save edits to notes/totalCost
	// without unclaiming first. Server-side guard still rejects increases that
	// violate the invariant.
	const effectiveMax = isEdit ? Math.max(remainingQuantity, props.gift.quantity) : remainingQuantity
	const schema = buildSchema(effectiveMax)

	const form = useForm({
		defaultValues: {
			quantity: isEdit ? String(props.gift.quantity) : '1',
			notes: isEdit ? (props.gift.notes ?? '') : '',
			totalCost: isEdit ? (props.gift.totalCost ?? '') : '',
		},
		onSubmit: async ({ value }) => {
			const parsed = schema.safeParse(value, zodParams())
			if (!parsed.success) {
				setError(zodIssuesText(parsed.error))
				return
			}

			setSubmitting(true)
			setError(null)
			try {
				if (isEdit) {
					// Edit: send `null` (not undefined) when the user has cleared a field,
					// so the server knows to clear it rather than leave it untouched.
					const trimmedNotes = parsed.data.notes?.trim() ?? ''
					const trimmedCost = parsed.data.totalCost?.trim() ?? ''
					const result = await updateItemGift({
						data: {
							giftId: props.gift.id,
							quantity: parsed.data.quantity,
							notes: trimmedNotes ? trimmedNotes : null,
							totalCost: trimmedCost ? trimmedCost : null,
						},
					})

					if (result.kind === 'error') {
						switch (result.reason) {
							case 'over-claim':
								setError(m.items_claim_error_over_claim({ remaining: result.remaining }))
								break
							case 'not-yours':
								setError(m.items_claim_edit_error_not_yours())
								break
							case 'not-found':
								setError(m.items_claim_error_not_found())
								break
						}
						return
					}

					toast.success(m.items_claim_toast_updated())
				} else {
					const result = await claimItemGift({
						data: {
							itemId,
							quantity: parsed.data.quantity,
							notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : undefined,
							totalCost: parsed.data.totalCost?.trim() ? parsed.data.totalCost.trim() : undefined,
						},
					})

					if (result.kind === 'error') {
						// Surface the server-side message. 'over-claim' includes updated remaining,
						// which is the one case where the client should show the fresh number
						// rather than the stale one we rendered the dialog with.
						switch (result.reason) {
							case 'over-claim':
								setError(m.items_claim_error_over_claim({ remaining: result.remaining }))
								break
							case 'not-visible':
								setError(m.items_claim_error_not_visible())
								break
							case 'cannot-claim-own-list':
								setError(m.items_claim_error_own_list())
								break
							case 'item-not-found':
								setError(m.items_claim_error_item_gone())
								break
							case 'group-already-claimed':
								setError(
									result.blockingItemTitle
										? m.items_claim_error_group_claimed_named({ title: result.blockingItemTitle })
										: m.items_claim_error_group_claimed()
								)
								break
							case 'group-out-of-order':
								setError(
									result.blockingItemTitle
										? m.items_claim_error_group_order_named({ title: result.blockingItemTitle })
										: m.items_claim_error_group_order()
								)
								break
							case 'unavailable':
								setError(m.items_claim_error_unavailable())
								break
						}
						return
					}

					toast.success(m.items_claim_toast_saved())
					props.onClaimed?.()
				}

				// Refresh the claimant's own surfaces immediately (see handleUnclaim).
				applyListEventLocally({ kind: 'claim', listId }, { queryClient, router })
				onOpenChange(false)
				form.reset()
			} catch (err) {
				setError(errorText(err, m.items_claim_error_save_failed()))
			} finally {
				setSubmitting(false)
			}
		},
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<div className="flex items-start gap-3">
						<div className="flex-1 min-w-0 flex flex-col gap-2">
							<DialogTitle className="text-base line-clamp-3 leading-snug">
								{isEdit ? m.items_claim_edit_dialog_title({ title: itemTitle }) : m.items_claim_dialog_title({ title: itemTitle })}
							</DialogTitle>
							<DialogDescription>{isEdit ? m.items_claim_edit_dialog_description() : m.items_claim_dialog_description()}</DialogDescription>
						</div>
						{itemImageUrl && (
							<RemoteImage
								src={itemImageUrl}
								alt=""
								className="size-14 shrink-0 rounded-md object-contain ring-1 ring-inset ring-border bg-muted/40"
							/>
						)}
					</div>
				</DialogHeader>

				<form
					onSubmit={e => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					<form.Field name="quantity">
						{field => {
							// Hide the input when there's nothing meaningful to choose: item
							// total is 1 or only 1 slot is left to claim. The field stays
							// mounted so the default quantity (1, or the edited gift's value)
							// still submits.
							if (effectiveMax <= 1) return null
							return (
								<div className="grid gap-2">
									<div className="flex items-center gap-3">
										<Label htmlFor={field.name} className="shrink-0">
											{m.items_field_quantity()}
										</Label>
										<Input
											id={field.name}
											type="number"
											min={1}
											max={effectiveMax}
											value={field.state.value}
											onChange={e => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
											disabled={submitting}
											className="flex-1 min-w-0"
										/>
										<QuantityRemainingBadge
											variant="inline-pill"
											quantity={itemQuantity}
											remaining={remainingQuantity}
											claimedCount={claimedCount}
											unavailable={unavailable}
											unavailableChangedAt={unavailableChangedAt}
										/>
									</div>
									{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
										<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
									)}
								</div>
							)
						}}
					</form.Field>

					<form.Field name="totalCost">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>{m.items_claim_cost_label()}</Label>
								<div className="relative">
									<DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
									<Input
										id={field.name}
										type="number"
										inputMode="decimal"
										min="0"
										step="0.01"
										placeholder="0.00"
										value={field.state.value}
										onChange={e => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={submitting}
										className="pl-8"
									/>
								</div>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
								)}
							</div>
						)}
					</form.Field>

					<form.Field name="notes">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>{m.items_claim_notes_label()}</Label>
								<Textarea
									id={field.name}
									placeholder={m.items_claim_notes_placeholder()}
									rows={3}
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={submitting}
									maxLength={LIMITS.MEDIUM_TEXT}
								/>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
								)}
							</div>
						)}
					</form.Field>

					{/* CO-GIFTERS - edit mode only */}
					{isEdit && (
						<CoGiftersSection
							giftId={props.gift.id}
							coGifterIds={coGifterIds}
							setCoGifterIds={setCoGifterIds}
							allUsers={allUsers ?? []}
							saving={coGifterSaving}
							setSaving={setCoGifterSaving}
							onSaved={() => {
								applyListEventLocally({ kind: 'claim', listId }, { queryClient, router })
							}}
						/>
					)}

					{error && (
						<Alert variant="destructive">
							<AlertTitle>{isEdit ? m.items_claim_edit_error_title() : m.items_claim_error_title()}</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						{isEdit && (
							<Button type="button" variant="destructive" onClick={() => setUnclaimConfirmOpen(true)} disabled={submitting}>
								{m.items_claim_unclaim_button()}
							</Button>
						)}
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							{m.action_cancel()}
						</Button>
						<Button type="submit" disabled={submitting || effectiveMax === 0}>
							{submitting ? m.state_saving() : isEdit ? m.action_save() : m.items_claim_button()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>

			{isEdit && (
				<ConfirmDialog
					open={unclaimConfirmOpen}
					onOpenChange={setUnclaimConfirmOpen}
					title={m.items_claim_unclaim_confirm_title({ title: itemTitle })}
					description={m.items_claim_unclaim_confirm_description()}
					confirmLabel={m.items_claim_unclaim_confirm_button()}
					confirmBusyLabel={m.items_claim_unclaim_busy()}
					destructive
					onConfirm={handleUnclaim}
				/>
			)}
		</Dialog>
	)
}

// ===============================
// Co-gifters sub-section
// ===============================

type CoGiftersSectionProps = {
	giftId: number
	coGifterIds: Array<string>
	setCoGifterIds: (ids: Array<string>) => void
	allUsers: Array<{ id: string; name: string | null; email: string }>
	saving: boolean
	setSaving: (v: boolean) => void
	onSaved: () => void
}

function CoGiftersSection({ giftId, coGifterIds, setCoGifterIds, allUsers, saving, setSaving, onSaved }: CoGiftersSectionProps) {
	const [selectedUser, setSelectedUser] = useState('')

	const availableUsers = allUsers.filter(u => !coGifterIds.includes(u.id))
	const coGifterUsers = allUsers.filter(u => coGifterIds.includes(u.id))

	const handleAdd = async () => {
		if (!selectedUser) return
		const prev = coGifterIds
		const newIds = [...coGifterIds, selectedUser]
		setCoGifterIds(newIds)
		setSelectedUser('')
		if (!(await saveCoGifters(newIds))) setCoGifterIds(prev)
	}

	const handleRemove = async (userId: string) => {
		const prev = coGifterIds
		const newIds = coGifterIds.filter(id => id !== userId)
		setCoGifterIds(newIds)
		if (!(await saveCoGifters(newIds))) setCoGifterIds(prev)
	}

	const saveCoGifters = async (ids: Array<string>): Promise<boolean> => {
		setSaving(true)
		try {
			const result = await updateCoGifters({ data: { giftId, additionalGifterIds: ids } })
			if (result.kind === 'ok') {
				toast.success(m.items_cogifters_toast_updated())
				onSaved()
				return true
			}
			toast.error(result.reason === 'not-allowed' ? m.items_cogifters_error_not_allowed() : m.items_cogifters_error_rejected())
			return false
		} catch {
			toast.error(m.items_cogifters_error_failed())
			return false
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="grid gap-2 border-t pt-4">
			<Label className="flex items-center gap-1.5">
				<UserPlus className="size-4" /> {m.items_cogifters_label()}
			</Label>
			<p className="text-xs text-muted-foreground">{m.items_cogifters_hint()}</p>

			{coGifterUsers.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{coGifterUsers.map(u => (
						<Badge key={u.id} variant="secondary" className="gap-1 pr-1">
							{u.name || u.email}
							<button type="button" onClick={() => handleRemove(u.id)} disabled={saving} className="hover:text-destructive">
								<X className="size-3" />
							</button>
						</Badge>
					))}
				</div>
			)}

			{availableUsers.length > 0 && (
				<div className="flex gap-2">
					<Select value={selectedUser} onValueChange={setSelectedUser} disabled={saving}>
						<SelectTrigger className="flex-1">
							<SelectValue placeholder={m.items_cogifters_placeholder()} />
						</SelectTrigger>
						<SelectContent>
							{availableUsers.map(u => (
								<SelectItem key={u.id} value={u.id}>
									{u.name || u.email}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button type="button" size="sm" variant="outline" onClick={handleAdd} disabled={saving || !selectedUser}>
						{m.action_add()}
					</Button>
				</div>
			)}
		</div>
	)
}
