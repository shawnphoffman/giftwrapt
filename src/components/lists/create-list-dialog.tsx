import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { createList } from '@/api/lists'
import { getPotentialPartners } from '@/api/user'
import ListTypeIcon from '@/components/common/list-type-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ListTypes, listTypeEnumValues } from '@/db/schema/enums'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

const schema = z.object({
	name: z.string().min(1, 'Name is required').max(200),
	type: z.enum(listTypeEnumValues),
	isPrivate: z.boolean(),
	description: z.string().max(2000).optional(),
	giftIdeasTargetUserId: z.string().optional(),
})

export function CreateListDialog({ open, onOpenChange }: Props) {
	const router = useRouter()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedType, setSelectedType] = useState('wishlist')

	const { data: users } = useQuery({
		queryKey: ['potential-partners'],
		queryFn: () => getPotentialPartners(),
		enabled: open,
	})

	const form = useForm({
		defaultValues: {
			name: '',
			type: 'wishlist' as string,
			isPrivate: false,
			description: '',
			giftIdeasTargetUserId: '',
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
				const result = await createList({
					data: {
						name: parsed.data.name,
						type: parsed.data.type,
						isPrivate: parsed.data.type === 'giftideas' ? true : parsed.data.isPrivate,
						description: parsed.data.description?.trim() || undefined,
						giftIdeasTargetUserId: parsed.data.type === 'giftideas' ? parsed.data.giftIdeasTargetUserId || undefined : undefined,
					},
				})

				if (result.kind === 'error') {
					switch (result.reason) {
						case 'target-required':
							setError('Gift Ideas lists require a target person.')
							break
					}
					return
				}

				toast.success(`List "${result.list.name}" created`)
				onOpenChange(false)
				form.reset()
				await router.invalidate()
				router.navigate({
					to: '/lists/$listId/edit',
					params: { listId: String(result.list.id) },
				})
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to create list')
			} finally {
				setSubmitting(false)
			}
		},
	})

	const isGiftIdeas = selectedType === 'giftideas'

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create a new list</DialogTitle>
					<DialogDescription>Choose a name and type for your list. You can change these later.</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={e => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					<form.Field name="name">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Name</Label>
								<Input
									id={field.name}
									placeholder="e.g. Christmas 2026"
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

					<form.Field name="type">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Type</Label>
								<Select
									value={field.state.value}
									onValueChange={v => {
										field.handleChange(v)
										setSelectedType(v)
										if (v === 'giftideas') {
											form.setFieldValue('isPrivate', true)
										}
									}}
									disabled={submitting}
								>
									<SelectTrigger id={field.name}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{listTypeEnumValues.map(t => (
											<SelectItem key={t} value={t}>
												<ListTypeIcon type={t} className="size-4" />
												{ListTypes[t]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</form.Field>

					{isGiftIdeas && (
						<form.Field name="giftIdeasTargetUserId">
							{field => (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>Gift ideas for</Label>
									<Select value={field.state.value} onValueChange={field.handleChange} disabled={submitting}>
										<SelectTrigger id={field.name}>
											<SelectValue placeholder="Select a person" />
										</SelectTrigger>
										<SelectContent>
											{users?.map(u => (
												<SelectItem key={u.id} value={u.id}>
													{u.name || u.email}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>
					)}

					<form.Field name="isPrivate">
						{field => (
							<div className="flex items-center gap-2">
								<Checkbox
									id={field.name}
									checked={isGiftIdeas ? true : field.state.value}
									onCheckedChange={v => field.handleChange(v === true)}
									disabled={submitting || isGiftIdeas}
								/>
								<Label htmlFor={field.name} className="font-normal">
									Private list {isGiftIdeas && '(always private for Gift Ideas)'}
								</Label>
							</div>
						)}
					</form.Field>

					<form.Field name="description">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Description (optional)</Label>
								<Textarea
									id={field.name}
									placeholder="A short description of this list"
									rows={2}
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
							<AlertTitle>Couldn't create list</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? 'Creating…' : 'Create list'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
