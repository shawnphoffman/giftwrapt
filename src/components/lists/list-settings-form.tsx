import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { updateList } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ListType } from '@/db/schema/enums'
import { listTypeEnumValues,ListTypes } from '@/db/schema/enums'

type Props = {
	listId: number
	name: string
	type: ListType
	isPrivate: boolean
	description: string | null
}

export function ListSettingsForm({ listId, name, type, isPrivate, description }: Props) {
	const router = useRouter()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const form = useForm({
		defaultValues: {
			name,
			type: type as string,
			isPrivate,
			description: description ?? '',
		},
		onSubmit: async ({ value }) => {
			if (!value.name.trim()) {
				setError('Name is required')
				return
			}

			setSubmitting(true)
			setError(null)
			try {
				const result = await updateList({
					data: {
						listId,
						name: value.name.trim(),
						type: value.type as ListType,
						isPrivate: value.type === 'giftideas' ? true : value.isPrivate,
						description: value.description.trim() || null,
					},
				})

				if (result.kind === 'error') {
					setError(result.reason === 'not-owner' ? 'Only the list owner can change settings.' : 'List not found.')
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
						<Select value={field.state.value} onValueChange={field.handleChange} disabled={submitting}>
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

			<form.Field name="isPrivate">
				{field => (
					<div className="flex items-center gap-2">
						<Checkbox
							id={field.name}
							checked={field.state.value}
							onCheckedChange={v => field.handleChange(v === true)}
							disabled={submitting}
						/>
						<Label htmlFor={field.name} className="font-normal">
							Private list
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
