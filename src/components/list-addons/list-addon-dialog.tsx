import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { DollarSign } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { createListAddon, updateListAddon } from '@/api/list-addons'
import type { AddonOnList } from '@/api/lists'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type BaseProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	listId: number
}

type CreateProps = BaseProps & { mode?: 'create'; addon?: never }
type EditProps = BaseProps & { mode: 'edit'; addon: AddonOnList }

type Props = CreateProps | EditProps

const schema = z.object({
	description: z.string().min(1, 'Description is required').max(500, 'Too long'),
	notes: z.string().max(2000, 'Too long').optional(),
	totalCost: z
		.string()
		.trim()
		.optional()
		.refine(v => !v || /^\d+(\.\d{1,2})?$/.test(v), {
			message: 'Must be a number like 12.50',
		}),
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

export function ListAddonDialog(props: Props) {
	const { open, onOpenChange, listId } = props
	const isEdit = props.mode === 'edit'
	const router = useRouter()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const form = useForm({
		defaultValues: {
			description: isEdit ? props.addon.description : '',
			notes: isEdit ? (props.addon.notes ?? '') : '',
			totalCost: isEdit ? (props.addon.totalCost ?? '') : '',
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
					const trimmedNotes = parsed.data.notes?.trim() ?? ''
					const trimmedCost = parsed.data.totalCost?.trim() ?? ''
					const result = await updateListAddon({
						data: {
							addonId: props.addon.id,
							description: parsed.data.description.trim(),
							notes: trimmedNotes ? trimmedNotes : null,
							totalCost: trimmedCost ? trimmedCost : null,
						},
					})

					if (result.kind === 'error') {
						switch (result.reason) {
							case 'not-yours':
								setError("You can't edit someone else's addon.")
								break
							case 'not-found':
								setError('This addon no longer exists.')
								break
						}
						return
					}

					toast.success('Off-list gift updated')
				} else {
					const result = await createListAddon({
						data: {
							listId,
							description: parsed.data.description.trim(),
							notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : undefined,
							totalCost: parsed.data.totalCost?.trim() ? parsed.data.totalCost.trim() : undefined,
						},
					})

					if (result.kind === 'error') {
						switch (result.reason) {
							case 'not-visible':
								setError('You no longer have access to this list.')
								break
							case 'cannot-add-to-own-list':
								setError("You can't add off-list gifts to your own list.")
								break
							case 'list-not-found':
								setError('This list no longer exists.')
								break
						}
						return
					}

					toast.success('Off-list gift added')
				}

				onOpenChange(false)
				form.reset()
				await router.invalidate()
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to save')
			} finally {
				setSubmitting(false)
			}
		},
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{isEdit ? 'Edit off-list gift' : 'Add off-list gift'}</DialogTitle>
					<DialogDescription>
						{isEdit
							? 'Update the details of your off-list gift. The list owner won\u2019t see this.'
							: "Record something you're gifting that isn't on the list. The list owner won't see this, just other viewers."}
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
					<form.Field name="description">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>What is it?</Label>
								<Input
									id={field.name}
									type="text"
									placeholder='e.g. "Matching scarf from Nordstrom"'
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

					<form.Field name="totalCost">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Total cost (optional)</Label>
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
								<Label htmlFor={field.name}>Notes (optional)</Label>
								<MarkdownTextarea
									id={field.name}
									placeholder="e.g. already ordered, arrives Friday"
									rows={3}
									value={field.state.value}
									onChange={v => field.handleChange(v)}
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
							<AlertTitle>{isEdit ? "Couldn't update" : "Couldn't save"}</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? 'Saving\u2026' : isEdit ? 'Save' : 'Add'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
