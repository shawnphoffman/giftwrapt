import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { updateItemGift } from '@/api/gifts'
import { updateListAddon } from '@/api/list-addons'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LIMITS } from '@/lib/validation/limits'

export type EditablePurchase =
	| { type: 'claim'; giftId: number; quantity: number; totalCost: string | null; notes: string | null }
	| { type: 'addon'; addonId: number; totalCost: string | null; notes: string | null }

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	purchase: EditablePurchase | null
}

const schema = z.object({
	totalCost: z
		.string()
		.trim()
		.optional()
		.refine(v => !v || /^\d+(\.\d{1,2})?$/.test(v), {
			message: 'Must be a number like 12.50',
		}),
	notes: z.string().max(LIMITS.MEDIUM_TEXT, 'Too long').optional(),
})

function getErrorMessage(errors: Array<unknown>): string {
	return errors
		.map(err => {
			if (typeof err === 'string') return err
			if (err && typeof err === 'object' && 'message' in err) return (err as { message: string }).message
			return String(err)
		})
		.join(', ')
}

export function PurchaseEditDialog({ open, onOpenChange, purchase }: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				{purchase && <PurchaseEditForm key={purchaseFormKey(purchase)} purchase={purchase} onOpenChange={onOpenChange} />}
			</DialogContent>
		</Dialog>
	)
}

function purchaseFormKey(p: EditablePurchase): string {
	return p.type === 'claim' ? `claim-${p.giftId}` : `addon-${p.addonId}`
}

function PurchaseEditForm({ purchase, onOpenChange }: { purchase: EditablePurchase; onOpenChange: (open: boolean) => void }) {
	const router = useRouter()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const form = useForm({
		defaultValues: {
			totalCost: purchase.totalCost ?? '',
			notes: purchase.notes ?? '',
		},
		onSubmit: async ({ value }) => {
			const parsed = schema.safeParse(value)
			if (!parsed.success) {
				setError(parsed.error.issues.map(e => e.message).join(', '))
				return
			}

			const trimmedCost = parsed.data.totalCost?.trim() ?? ''
			const trimmedNotes = parsed.data.notes?.trim() ?? ''

			setSubmitting(true)
			setError(null)

			try {
				if (purchase.type === 'claim') {
					const result = await updateItemGift({
						data: {
							giftId: purchase.giftId,
							quantity: purchase.quantity,
							notes: trimmedNotes ? trimmedNotes : null,
							totalCost: trimmedCost ? trimmedCost : null,
						},
					})

					if (result.kind === 'error') {
						switch (result.reason) {
							case 'not-yours':
								setError("You can't edit someone else's claim.")
								break
							case 'not-found':
								setError('This claim no longer exists.')
								break
							case 'over-claim':
								setError('Quantity exceeds what is available.')
								break
						}
						return
					}
				} else {
					const result = await updateListAddon({
						data: {
							addonId: purchase.addonId,
							notes: trimmedNotes ? trimmedNotes : null,
							totalCost: trimmedCost ? trimmedCost : null,
						},
					})

					if (result.kind === 'error') {
						switch (result.reason) {
							case 'not-yours':
								setError("You can't edit someone else's gift.")
								break
							case 'not-found':
								setError('This gift no longer exists.')
								break
						}
						return
					}
				}

				toast.success('Purchase updated')
				onOpenChange(false)
				await router.invalidate()
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to save')
			} finally {
				setSubmitting(false)
			}
		},
	})

	return (
		<>
			<DialogHeader>
				<DialogTitle>Edit Purchase Details</DialogTitle>
				<DialogDescription>Update the cost and notes for this purchase.</DialogDescription>
			</DialogHeader>

			<form
				onSubmit={e => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
				className="space-y-4"
			>
				<form.Field name="totalCost">
					{field => (
						<div className="grid gap-2">
							<Label htmlFor={field.name}>Total Cost</Label>
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
								<Input
									id={field.name}
									type="text"
									inputMode="decimal"
									placeholder="0.00"
									className="pl-7"
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={submitting}
									maxLength={LIMITS.PRICE}
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
							<Label htmlFor={field.name}>Notes</Label>
							<Textarea
								id={field.name}
								placeholder="Add any notes about this purchase..."
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

				{error && (
					<Alert variant="destructive">
						<AlertTitle>Couldn't update</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
						Cancel
					</Button>
					<Button type="submit" disabled={submitting}>
						{submitting ? 'Saving\u2026' : 'Save'}
					</Button>
				</DialogFooter>
			</form>
		</>
	)
}
