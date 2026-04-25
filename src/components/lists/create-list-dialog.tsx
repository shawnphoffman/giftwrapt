import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { addListEditor } from '@/api/list-editors'
import { createList } from '@/api/lists'
import { getPotentialPartners } from '@/api/user'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listTypeEnumValues, ListTypes } from '@/db/schema/enums'
import { useSession } from '@/lib/auth-client'

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
	addPartnerAsEditor: z.boolean(),
})

export function CreateListDialog({ open, onOpenChange }: Props) {
	const router = useRouter()
	const { data: session } = useSession()
	const isChild = session?.user.isChild ?? false
	const partnerId = session?.user.partnerId ?? null
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedType, setSelectedType] = useState('wishlist')

	const { data: users } = useQuery({
		queryKey: ['potential-partners'],
		queryFn: () => getPotentialPartners(),
		enabled: open,
	})

	const partner = partnerId ? users?.find(u => u.id === partnerId) : undefined
	const partnerLabel = partner ? partner.name || partner.email : 'your partner'

	const availableTypes = isChild ? listTypeEnumValues.filter(t => t !== 'giftideas') : listTypeEnumValues

	const form = useForm({
		defaultValues: {
			name: '',
			type: 'wishlist' as string,
			isPrivate: false,
			description: '',
			giftIdeasTargetUserId: '',
			addPartnerAsEditor: true,
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
				const willBePublic = parsed.data.type !== 'giftideas' && !parsed.data.isPrivate
				const shouldAddPartner = willBePublic && !!partnerId && !!partner && parsed.data.addPartnerAsEditor

				const result = await createList({
					data: {
						name: parsed.data.name,
						type: parsed.data.type,
						isPrivate: parsed.data.type === 'giftideas' ? true : parsed.data.isPrivate,
						description: parsed.data.description?.trim() || undefined,
						giftIdeasTargetUserId: parsed.data.type === 'giftideas' ? parsed.data.giftIdeasTargetUserId || undefined : undefined,
					},
				})

				if (shouldAddPartner && partnerId) {
					const editorResult = await addListEditor({ data: { listId: result.list.id, userId: partnerId } })
					if (editorResult.kind === 'error') {
						toast.warning(`List created, but couldn't add ${partnerLabel} as an editor.`)
					}
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
									name="list-name"
									placeholder="e.g. Christmas 2026"
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={submitting}
									autoFocus
									autoComplete="off"
									data-1p-ignore
									data-lpignore="true"
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
										{availableTypes.map(t => (
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
									<Label htmlFor={field.name}>Gift ideas for (optional)</Label>
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

					<form.Subscribe selector={s => s.values.isPrivate}>
						{isPrivate => {
							const willBePublic = !isGiftIdeas && !isPrivate
							if (!willBePublic || !partnerId || !partner) return null
							return (
								<form.Field name="addPartnerAsEditor">
									{field => (
										<div className="bg-muted/40 flex items-start gap-2 rounded-md border p-3">
											<Checkbox
												id={field.name}
												checked={field.state.value}
												onCheckedChange={v => field.handleChange(v === true)}
												disabled={submitting}
												className="mt-0.5"
											/>
											<div className="grid gap-1">
												<Label htmlFor={field.name} className="font-normal">
													Add {partnerLabel} as an editor
												</Label>
												<p className="text-muted-foreground text-xs">
													They'll be able to manage items on this list. You can change this anytime in list settings.
												</p>
											</div>
										</div>
									)}
								</form.Field>
							)
						}}
					</form.Subscribe>

					<form.Field name="description">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Description (optional)</Label>
								<MarkdownTextarea
									id={field.name}
									placeholder="A short description of this list"
									rows={2}
									value={field.state.value}
									onChange={v => field.handleChange(v)}
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
