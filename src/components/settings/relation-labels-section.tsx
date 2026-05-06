// Profile-section UI for the parental-relations layer. Lets a user
// declare 0:N mothers and 0:N fathers (each can be a `users` row OR a
// `dependents` row). Pure annotation; no permission implications. Drives
// Intelligence "set your people" recs and holiday reminder emails.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { getMyDependents } from '@/api/dependents'
import { addRelationLabel, getMyRelationLabels, type RelationLabelRow, removeRelationLabel } from '@/api/relation-labels'
import { getGiftIdeasRecipients } from '@/api/user'
import DependentAvatar from '@/components/common/dependent-avatar'
import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { RelationLabel } from '@/db/schema/enums'

type Bucket = { label: RelationLabel; title: string; addCta: string; emptyHelp: string }

const BUCKETS: ReadonlyArray<Bucket> = [
	{
		label: 'mother',
		title: 'Mothers',
		addCta: 'Add a mother',
		emptyHelp: 'Tag the people you shop for on Mother’s Day. They’ll appear on reminders and in Suggestions.',
	},
	{
		label: 'father',
		title: 'Fathers',
		addCta: 'Add a father',
		emptyHelp: 'Tag the people you shop for on Father’s Day. They’ll appear on reminders and in Suggestions.',
	},
]

export function RelationLabelsSection() {
	const queryClient = useQueryClient()

	const { data: rows = [] } = useQuery({ queryKey: ['my-relation-labels'], queryFn: () => getMyRelationLabels(), staleTime: 60_000 })
	const { data: people = [] } = useQuery({
		queryKey: ['gift-ideas-recipients'],
		queryFn: () => getGiftIdeasRecipients(),
		staleTime: 10 * 60 * 1000,
	})
	const { data: deps } = useQuery({ queryKey: ['dependents', 'mine'], queryFn: () => getMyDependents(), staleTime: 5 * 60 * 1000 })

	const removeMutation = useMutation({
		mutationFn: (id: number) => removeRelationLabel({ data: { id } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-relation-labels'] }),
		onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to remove'),
	})

	return (
		<div className="grid gap-6">
			{BUCKETS.map(b => (
				<RelationBucket
					key={b.label}
					bucket={b}
					rows={rows.filter(r => r.label === b.label)}
					people={people}
					dependents={(deps?.dependents ?? []).filter(d => !d.isArchived)}
					onRemove={id => removeMutation.mutate(id)}
				/>
			))}
		</div>
	)
}

type RelationBucketProps = {
	bucket: Bucket
	rows: ReadonlyArray<RelationLabelRow>
	people: ReadonlyArray<{ id: string; name: string | null; email: string; image: string | null }>
	dependents: ReadonlyArray<{ id: string; name: string; image: string | null }>
	onRemove: (id: number) => void
}

function RelationBucket({ bucket, rows, people, dependents, onRemove }: RelationBucketProps) {
	const queryClient = useQueryClient()
	const [adding, setAdding] = useState(false)
	const [pickerValue, setPickerValue] = useState('')

	const claimedIds = new Set(rows.map(r => `${r.target.kind}:${r.target.id}`))

	const addMutation = useMutation({
		mutationFn: (value: string) => {
			const [kind, id] = value.split(':') as ['u' | 'd', string]
			return addRelationLabel({
				data: {
					label: bucket.label,
					targetUserId: kind === 'u' ? id : undefined,
					targetDependentId: kind === 'd' ? id : undefined,
				},
			})
		},
		onSuccess: result => {
			if (result.kind === 'error') {
				const message: Record<typeof result.reason, string> = {
					'invalid-target': 'Pick someone before saving.',
					'self-target': "You can't add yourself.",
					duplicate: 'They’re already in this list.',
					'target-not-found': "Couldn't find that person.",
					'not-dependent-guardian': 'You’re not a guardian of that dependent.',
				}
				toast.error(message[result.reason])
				return
			}
			setAdding(false)
			setPickerValue('')
			queryClient.invalidateQueries({ queryKey: ['my-relation-labels'] })
		},
		onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to add'),
	})

	const userOptions = people.filter(u => !claimedIds.has(`user:${u.id}`))
	const depOptions = dependents.filter(d => !claimedIds.has(`dependent:${d.id}`))

	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between">
				<Label>{bucket.title}</Label>
				{!adding && (
					<Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)}>
						<Plus className="size-4" />
						{bucket.addCta}
					</Button>
				)}
			</div>

			{rows.length === 0 && !adding && <p className="text-muted-foreground text-xs">{bucket.emptyHelp}</p>}

			{rows.length > 0 && (
				<ul className="grid gap-1">
					{rows.map(r => (
						<li key={r.id} className="bg-muted/40 flex items-center gap-2 rounded-md border p-2">
							{r.target.kind === 'user' ? (
								<>
									<UserAvatar name={r.target.name || r.target.email} image={r.target.image} size="small" />
									<span className="flex-1 truncate text-sm">{r.target.name || r.target.email}</span>
								</>
							) : (
								<>
									<DependentAvatar name={r.target.name} image={r.target.image} size="small" />
									<span className="flex-1 truncate text-sm">{r.target.name}</span>
								</>
							)}
							<Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => onRemove(r.id)}>
								<Trash2 className="size-4" />
							</Button>
						</li>
					))}
				</ul>
			)}

			{adding && (
				<div className="flex items-center gap-2">
					<Select value={pickerValue} onValueChange={setPickerValue} disabled={addMutation.isPending}>
						<SelectTrigger className="flex-1">
							<SelectValue placeholder="Select a person" />
						</SelectTrigger>
						<SelectContent>
							{userOptions.length === 0 && depOptions.length === 0 && (
								<div className="text-muted-foreground p-2 text-xs">Nobody available to add.</div>
							)}
							{userOptions.map(u => (
								<SelectItem key={`u:${u.id}`} value={`u:${u.id}`}>
									<UserAvatar name={u.name || u.email} image={u.image} size="small" />
									<span className="truncate">{u.name || u.email}</span>
								</SelectItem>
							))}
							{depOptions.map(d => (
								<SelectItem key={`d:${d.id}`} value={`d:${d.id}`}>
									<DependentAvatar name={d.name} image={d.image} size="small" />
									<span className="truncate">{d.name}</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button type="button" size="sm" onClick={() => addMutation.mutate(pickerValue)} disabled={!pickerValue || addMutation.isPending}>
						Save
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => {
							setAdding(false)
							setPickerValue('')
						}}
					>
						Cancel
					</Button>
				</div>
			)}
		</div>
	)
}
