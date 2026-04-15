import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { claimItemGift } from '@/api/gifts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	itemId: number
	itemTitle: string
	remainingQuantity: number
}

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

export function ClaimGiftDialog({ open, onOpenChange, itemId, itemTitle, remainingQuantity }: Props) {
	const router = useRouter()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const schema = buildSchema(remainingQuantity)

	const form = useForm({
		defaultValues: {
			quantity: '1',
			notes: '',
			totalCost: '',
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
					}
					return
				}

				toast.success('Claim saved')
				onOpenChange(false)
				form.reset()
				// Re-run the list-detail loader so the claim shows up.
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
					<DialogTitle>Claim “{itemTitle}”</DialogTitle>
					<DialogDescription>
						Mark this as something you're gifting. The list owner won't see the claim — only other viewers will.
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
						{field => (
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
								<p className="text-xs text-muted-foreground">{remainingQuantity} left to claim</p>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
								)}
							</div>
						)}
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

					{error && (
						<Alert variant="destructive">
							<AlertTitle>Couldn't save claim</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" disabled={submitting || remainingQuantity === 0}>
							{submitting ? 'Saving…' : 'Claim'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
