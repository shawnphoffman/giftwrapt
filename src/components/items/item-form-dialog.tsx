import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { createItem, updateItem } from '@/api/items'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import PriorityIcon from '@/components/common/priority-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { priorityEnumValues } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'

type BaseProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

type CreateProps = BaseProps & { mode: 'create'; listId: number; item?: never; groupId?: number | null }
type EditProps = BaseProps & { mode: 'edit'; listId?: never; item: Item; groupId?: never }

type Props = CreateProps | EditProps

const PriorityLabels: Record<string, string> = {
	low: 'Low',
	normal: 'Normal',
	high: 'High',
	'very-high': 'Very High',
}

const schema = z.object({
	title: z.string().min(1, 'Title is required').max(500),
	url: z.string().max(2000).optional(),
	price: z.string().max(50).optional(),
	notes: z.string().max(5000).optional(),
	priority: z.enum(priorityEnumValues),
	quantity: z.coerce.number().int().positive('Must be at least 1').max(999),
	imageUrl: z.string().max(2000).optional(),
})

export function ItemFormDialog(props: Props) {
	const { open, onOpenChange } = props
	const isEdit = props.mode === 'edit'
	const router = useRouter()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const form = useForm({
		defaultValues: {
			title: isEdit ? props.item.title : '',
			url: isEdit ? (props.item.url ?? '') : '',
			price: isEdit ? (props.item.price ?? '') : '',
			notes: isEdit ? (props.item.notes ?? '') : '',
			priority: isEdit ? props.item.priority : 'normal',
			quantity: isEdit ? String(props.item.quantity) : '1',
			imageUrl: isEdit ? (props.item.imageUrl ?? '') : '',
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
					const trimmedUrl = parsed.data.url?.trim() || null
					const trimmedPrice = parsed.data.price?.trim() || null
					const trimmedNotes = parsed.data.notes?.trim() || null
					const trimmedImageUrl = parsed.data.imageUrl?.trim() || null

					const result = await updateItem({
						data: {
							itemId: props.item.id,
							title: parsed.data.title,
							url: trimmedUrl,
							price: trimmedPrice,
							notes: trimmedNotes,
							priority: parsed.data.priority,
							quantity: parsed.data.quantity,
							imageUrl: trimmedImageUrl,
						},
					})

					if (result.kind === 'error') {
						setError(result.reason === 'not-authorized' ? 'You no longer have permission to edit this item.' : 'Item not found.')
						return
					}

					toast.success('Item updated')
				} else {
					const result = await createItem({
						data: {
							listId: props.listId,
							title: parsed.data.title,
							url: parsed.data.url?.trim() || undefined,
							price: parsed.data.price?.trim() || undefined,
							notes: parsed.data.notes?.trim() || undefined,
							priority: parsed.data.priority,
							quantity: parsed.data.quantity,
							imageUrl: parsed.data.imageUrl?.trim() || undefined,
							groupId: props.groupId ?? undefined,
						},
					})

					if (result.kind === 'error') {
						setError(result.reason === 'not-authorized' ? 'You no longer have permission to add items to this list.' : 'List not found.')
						return
					}

					toast.success('Item added')
				}

				onOpenChange(false)
				form.reset()
				await router.invalidate()
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to save item')
			} finally {
				setSubmitting(false)
			}
		},
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{isEdit ? 'Edit item' : 'Add item'}</DialogTitle>
					<DialogDescription>{isEdit ? 'Update the details for this item.' : 'Add a new item to your list.'}</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={e => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					<form.Field name="title">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Title</Label>
								<Input
									id={field.name}
									placeholder="e.g. AirPods Pro"
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={submitting}
									autoFocus
								/>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">
										{field.state.meta.errors.map(e => (typeof e === 'string' ? e : String(e))).join(', ')}
									</p>
								)}
							</div>
						)}
					</form.Field>

					<form.Field name="url">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>URL (optional)</Label>
								<Input
									id={field.name}
									type="url"
									placeholder="https://..."
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={submitting}
								/>
							</div>
						)}
					</form.Field>

					<div className="grid grid-cols-2 gap-4">
						<form.Field name="price">
							{field => (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>Price (optional)</Label>
									<Input
										id={field.name}
										placeholder="29.99"
										inputMode="decimal"
										value={field.state.value}
										onChange={e => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={submitting}
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="quantity">
							{field => (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>Quantity</Label>
									<Input
										id={field.name}
										type="number"
										min={1}
										max={999}
										value={field.state.value}
										onChange={e => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={submitting}
									/>
								</div>
							)}
						</form.Field>
					</div>

					<form.Field name="priority">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Priority</Label>
								<Select
									value={field.state.value}
									onValueChange={v => field.handleChange(v as typeof field.state.value)}
									disabled={submitting}
								>
									<SelectTrigger id={field.name}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{[...priorityEnumValues].reverse().map(p => (
											<SelectItem key={p} value={p}>
												<span className="inline-flex items-center gap-2">
													<span className="inline-flex size-4 items-center justify-center">
														<PriorityIcon priority={p} />
													</span>
													{PriorityLabels[p] ?? p}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</form.Field>

					<form.Field name="notes">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Notes (optional)</Label>
								<MarkdownTextarea
									id={field.name}
									placeholder="Color preferences, size, model, etc."
									rows={3}
									value={field.state.value}
									onChange={v => field.handleChange(v)}
									onBlur={field.handleBlur}
									disabled={submitting}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="imageUrl">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Image URL (optional)</Label>
								<Input
									id={field.name}
									placeholder="https://..."
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={submitting}
								/>
							</div>
						)}
					</form.Field>

					{error && (
						<Alert variant="destructive">
							<AlertTitle>{isEdit ? "Couldn't update item" : "Couldn't add item"}</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? 'Saving…' : isEdit ? 'Save' : 'Add item'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
