import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { updateList } from '@/api/lists'
import { getPotentialPartners } from '@/api/user'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ListType } from '@/db/schema/enums'
import { listTypeEnumValues, ListTypes } from '@/db/schema/enums'

const NO_RECIPIENT = '__none__'

type Props = {
	listId: number
	name: string
	type: ListType
	isPrivate: boolean
	description: string | null
	giftIdeasTargetUserId: string | null
	editorUserIds: Array<string>
}

export function ListSettingsForm({ listId, name, type, isPrivate, description, giftIdeasTargetUserId, editorUserIds }: Props) {
	const router = useRouter()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedType, setSelectedType] = useState<string>(type)

	const isGiftIdeas = selectedType === 'giftideas'

	const { data: users } = useQuery({
		queryKey: ['potential-partners'],
		queryFn: () => getPotentialPartners(),
		enabled: isGiftIdeas,
	})

	const form = useForm({
		defaultValues: {
			name,
			type: type as string,
			isPrivate,
			description: description ?? '',
			giftIdeasTargetUserId: giftIdeasTargetUserId ?? '',
		},
		onSubmit: async ({ value }) => {
			if (!value.name.trim()) {
				setError('Name is required')
				return
			}

			setSubmitting(true)
			setError(null)
			try {
				const nextType = value.type as ListType
				const result = await updateList({
					data: {
						listId,
						name: value.name.trim(),
						type: nextType,
						isPrivate: nextType === 'giftideas' ? true : value.isPrivate,
						description: value.description.trim() || null,
						giftIdeasTargetUserId: nextType === 'giftideas' ? value.giftIdeasTargetUserId || null : null,
					},
				})

				if (result.kind === 'error') {
					setError(result.reason === 'not-authorized' ? "You don't have permission to change this list's settings." : 'List not found.')
					return
				}

				toast.success('List settings saved')
				await router.invalidate()
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to save settings')
			} finally {
				setSubmitting(false)
			}
		},
	})

	return (
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
						<Input id={field.name} value={field.state.value} onChange={e => field.handleChange(e.target.value)} disabled={submitting} />
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
					{field => {
						const recipientId = field.state.value
						const recipientIsEditor = !!recipientId && editorUserIds.includes(recipientId)
						const recipient = recipientIsEditor ? users?.find(u => u.id === recipientId) : undefined
						const recipientLabel = recipient ? recipient.name || recipient.email : 'this person'
						return (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Gift ideas for (optional)</Label>
								<Select
									value={field.state.value || NO_RECIPIENT}
									onValueChange={v => field.handleChange(v === NO_RECIPIENT ? '' : v)}
									disabled={submitting}
								>
									<SelectTrigger id={field.name}>
										<SelectValue placeholder="Select a person" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_RECIPIENT}>No recipient</SelectItem>
										{users?.map(u => (
											<SelectItem key={u.id} value={u.id}>
												{u.name || u.email}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{recipientIsEditor && (
									<Alert variant="warning">
										<AlertTitle>Recipient is also an editor</AlertTitle>
										<AlertDescription>
											{recipientLabel} is listed as an editor and will be able to see this list. Remove them as an editor to keep gift ideas
											a surprise.
										</AlertDescription>
									</Alert>
								)}
							</div>
						)
					}}
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
						<MarkdownTextarea
							id={field.name}
							rows={2}
							value={field.state.value}
							onChange={v => field.handleChange(v)}
							disabled={submitting}
						/>
					</div>
				)}
			</form.Field>

			{error && (
				<Alert variant="destructive">
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<Button type="submit" disabled={submitting}>
				{submitting ? 'Saving…' : 'Save settings'}
			</Button>
		</form>
	)
}
