import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { claimItemGift, updateCoGifters, updateItemGift } from '@/api/gifts'
import type { GiftOnItem } from '@/api/lists'
import { getPotentialPartners } from '@/api/user'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type BaseProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	itemId: number
	itemTitle: string
	// For create mode: remaining = item.quantity - sum(all claims).
	// For edit mode:   remaining = item.quantity - sum(OTHER claims) — so the
	// current claim's own quantity is part of the budget the user can spend.
	remainingQuantity: number
}

type CreateProps = BaseProps & { mode?: 'create'; gift?: never }
type EditProps = BaseProps & { mode: 'edit'; gift: GiftOnItem }

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

// Matches the server-side schema shape. Duplicated deliberately — zod types
// don't cross the server/client boundary cleanly, and the UX constraints
// (max capped to remainingQuantity) differ from the server-side guard
// (which enforces the invariant under a row lock).
function buildSchema(remaining: number) {
	return z.object({
		quantity: z.coerce.number().int().positive('Must be at least 1').max(remaining, `Only ${remaining} left to claim`),
		notes: z.string().max(2000, 'Too long').optional(),
		totalCost: z
			.string()
			.trim()
			.optional()
			.refine(v => !v || /^\d+(\.\d{1,2})?$/.test(v), {
				message: 'Must be a number like 12.50',
			}),
	})
}

export function ClaimGiftDialog(props: Props) {
	const { open, onOpenChange, itemId, itemTitle, remainingQuantity } = props
	const isEdit = props.mode === 'edit'
	const router = useRouter()
	const queryClient = useQueryClient()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [coGifterIds, setCoGifterIds] = useState<Array<string>>(isEdit ? (props.gift.additionalGifterIds ?? []) : [])
	const [coGifterSaving, setCoGifterSaving] = useState(false)

	const { data: allUsers } = useQuery({
		queryKey: ['potential-partners'],
		queryFn: () => getPotentialPartners(),
		enabled: open && isEdit,
	})

	const schema = buildSchema(remainingQuantity)

	const form = useForm({
		defaultValues: {
			quantity: isEdit ? String(props.gift.quantity) : '1',
			notes: isEdit ? (props.gift.notes ?? '') : '',
			totalCost: isEdit ? (props.gift.totalCost ?? '') : '',
		},
		onSubmit: async ({ value }) => {
			const parsed = schema.safeParse(value)
			if (!parsed.success) {
				setError(parsed.error.issues.map(e => e.message).join(', '))
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
								setError(`Too many — only ${result.remaining} left (someone else may have just claimed).`)
								break
							case 'not-yours':
								setError("You can't edit someone else's claim.")
								break
							case 'not-found':
								setError('This claim no longer exists.')
								break
						}
						return
					}

					toast.success('Claim updated')
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
								setError(`Too many — only ${result.remaining} left. Someone else may have just claimed.`)
								break
							case 'not-visible':
								setError('You no longer have access to this list.')
								break
							case 'cannot-claim-own-list':
								setError("You can't claim from your own list.")
								break
							case 'item-not-found':
								setError('This item is no longer available.')
								break
							case 'group-already-claimed':
								setError(
									result.blockingItemTitle
										? `This is part of a "pick one" group and "${result.blockingItemTitle}" was already claimed.`
										: 'This is part of a "pick one" group that has already been claimed.'
								)
								break
							case 'group-out-of-order':
								setError(
									result.blockingItemTitle
										? `Claim "${result.blockingItemTitle}" first — this group has a required order.`
										: 'This group has a required order; claim earlier items first.'
								)
								break
						}
						return
					}

					toast.success('Claim saved')
				}

				onOpenChange(false)
				form.reset()
				// Re-run the list-detail loader so the change shows up. Also
				// invalidate the grouped public-lists query so the home-page
				// "unclaimed / total" badge reflects this claim immediately,
				// without waiting for the SSE round-trip.
				queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'grouped'] })
				await router.invalidate()
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to save claim')
			} finally {
				setSubmitting(false)
			}
		},
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{isEdit ? 'Edit your claim on' : 'Claim'} “{itemTitle}”
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? 'Update the quantity, cost, or notes on your claim. The list owner still won\u2019t see any of this.'
							: "Mark this as something you're gifting. The list owner won't see the claim — only other viewers will."}
					</DialogDescription>
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
							// Hide the input when there's nothing meaningful to choose — item
							// total is 1 or only 1 slot is left to claim. The field stays
							// mounted so the default quantity (1, or the edited gift's value)
							// still submits.
							if (remainingQuantity <= 1) return null
							return (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>Quantity</Label>
									<Input
										id={field.name}
										type="number"
										min={1}
										max={remainingQuantity}
										value={field.state.value}
										onChange={e => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={submitting}
									/>
									<p className="text-xs text-muted-foreground">{remainingQuantity} available to claim</p>
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
								<Label htmlFor={field.name}>Total cost (optional)</Label>
								<Input
									id={field.name}
									type="text"
									inputMode="decimal"
									placeholder="12.50"
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={submitting}
								/>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
								)}
							</div>
						)}
					</form.Field>

					<form.Field name="notes">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Notes (optional)</Label>
								<Textarea
									id={field.name}
									placeholder="e.g. already ordered, arriving Friday"
									rows={3}
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={submitting}
								/>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
								)}
							</div>
						)}
					</form.Field>

					{/* CO-GIFTERS — edit mode only */}
					{isEdit && (
						<CoGiftersSection
							giftId={props.gift.id}
							coGifterIds={coGifterIds}
							setCoGifterIds={setCoGifterIds}
							allUsers={allUsers ?? []}
							saving={coGifterSaving}
							setSaving={setCoGifterSaving}
							onSaved={() => router.invalidate()}
						/>
					)}

					{error && (
						<Alert variant="destructive">
							<AlertTitle>{isEdit ? "Couldn't update claim" : "Couldn't save claim"}</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" disabled={submitting || remainingQuantity === 0}>
							{submitting ? 'Saving…' : isEdit ? 'Save' : 'Claim'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
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
		const newIds = [...coGifterIds, selectedUser]
		setCoGifterIds(newIds)
		setSelectedUser('')
		await saveCoGifters(newIds)
	}

	const handleRemove = async (userId: string) => {
		const newIds = coGifterIds.filter(id => id !== userId)
		setCoGifterIds(newIds)
		await saveCoGifters(newIds)
	}

	const saveCoGifters = async (ids: Array<string>) => {
		setSaving(true)
		try {
			const result = await updateCoGifters({ data: { giftId, additionalGifterIds: ids } })
			if (result.kind === 'ok') {
				toast.success('Co-gifters updated')
				onSaved()
			}
		} catch {
			toast.error('Failed to update co-gifters')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="grid gap-2 border-t pt-4">
			<Label className="flex items-center gap-1.5">
				<UserPlus className="size-4" /> Co-gifters (optional)
			</Label>
			<p className="text-xs text-muted-foreground">Add people who are splitting this gift with you.</p>

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
							<SelectValue placeholder="Add a co-gifter" />
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
						Add
					</Button>
				</div>
			)}
		</div>
	)
}
