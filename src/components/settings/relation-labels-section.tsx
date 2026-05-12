// Profile-section UI for the parental-relations layer. Lets a user
// declare 0:N mothers and 0:N fathers (each can be a `users` row OR a
// `dependents` row). Pure annotation; no permission implications. Drives
// Intelligence "set your people" recs and holiday reminder emails.
//
// The section is polymorphic over WHO it's editing for. Self-service
// usage (the profile page) uses the default `selfOps` bundle of server
// fns; the admin "Edit user" dialog passes `adminOpsFor(userId)` so an
// admin can manage someone else's labels without touching their own.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
	addRelationLabelForUserAsAdmin,
	getRelationLabelCandidatesForUserAsAdmin,
	getRelationLabelsForUserAsAdmin,
	removeRelationLabelForUserAsAdmin,
} from '@/api/admin'
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
		addCta: 'Add',
		emptyHelp: 'Tag the people you shop for on Mother’s Day. They’ll appear on reminders and in Suggestions.',
	},
	{
		label: 'father',
		title: 'Fathers',
		addCta: 'Add',
		emptyHelp: 'Tag the people you shop for on Father’s Day. They’ll appear on reminders and in Suggestions.',
	},
]

type AddInput = {
	label: RelationLabel
	targetUserId?: string
	targetDependentId?: string
}

type PersonOption = { id: string; name: string | null; email: string; image: string | null }

// Pluggable backend so the same UI drives self-service and admin
// edit-user surfaces. Each ops bundle bakes in the target userId where
// necessary so the component never has to know which mode it's in. The
// `people` slot is part of the bundle so admin context can fetch an
// unfiltered candidate list instead of inheriting the actor's privacy
// filter from `getGiftIdeasRecipients`.
export type RelationLabelsOps = {
	listKey: ReadonlyArray<unknown>
	list: () => Promise<Array<RelationLabelRow>>
	add: (input: AddInput) => Promise<unknown>
	remove: (id: number) => Promise<unknown>
	peopleKey: ReadonlyArray<unknown>
	listPeople: () => Promise<Array<PersonOption>>
}

export const selfOps: RelationLabelsOps = {
	listKey: ['my-relation-labels'],
	list: () => getMyRelationLabels(),
	add: input => addRelationLabel({ data: input }),
	remove: id => removeRelationLabel({ data: { id } }),
	peopleKey: ['gift-ideas-recipients'],
	listPeople: () => getGiftIdeasRecipients(),
}

export function adminOpsFor(userId: string): RelationLabelsOps {
	return {
		listKey: ['admin', 'relation-labels', userId],
		list: () => getRelationLabelsForUserAsAdmin({ data: { userId } }),
		add: input => addRelationLabelForUserAsAdmin({ data: { userId, ...input } }),
		remove: id => removeRelationLabelForUserAsAdmin({ data: { userId, id } }),
		peopleKey: ['admin', 'relation-label-candidates', userId],
		listPeople: () => getRelationLabelCandidatesForUserAsAdmin({ data: { userId } }),
	}
}

type RelationLabelsSectionProps = {
	ops?: RelationLabelsOps
	// When true, hides the dependent picker. Admin context can't easily
	// scope the dependents list to the edited user, so v1 keeps admin to
	// user targets only. The user can always add dependent rows from
	// their own profile page.
	hideDependents?: boolean
	// Per-arm gating from the admin Relationship Reminders settings.
	// When false, the corresponding bucket is hidden. Default true so
	// existing admin/edit-user callers keep showing both.
	showMothers?: boolean
	showFathers?: boolean
}

export function RelationLabelsSection({
	ops = selfOps,
	hideDependents = false,
	showMothers = true,
	showFathers = true,
}: RelationLabelsSectionProps = {}) {
	const queryClient = useQueryClient()

	const { data: rows = [] } = useQuery({ queryKey: ops.listKey, queryFn: () => ops.list(), staleTime: 60_000 })
	const { data: people = [] } = useQuery({
		queryKey: ops.peopleKey,
		queryFn: () => ops.listPeople(),
		staleTime: 10 * 60 * 1000,
	})
	const { data: deps } = useQuery({
		queryKey: ['dependents', 'mine'],
		queryFn: () => getMyDependents(),
		staleTime: 5 * 60 * 1000,
		enabled: !hideDependents,
	})

	const removeMutation = useMutation({
		mutationFn: (id: number) => ops.remove(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ops.listKey }),
		onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to remove'),
	})

	const visibleBuckets = BUCKETS.filter(b => (b.label === 'mother' ? showMothers : showFathers))

	return (
		<div className="grid gap-6">
			{visibleBuckets.map(b => (
				<RelationBucket
					key={b.label}
					bucket={b}
					rows={rows.filter(r => r.label === b.label)}
					people={people}
					dependents={hideDependents ? [] : (deps?.dependents ?? []).filter(d => !d.isArchived)}
					ops={ops}
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
	ops: RelationLabelsOps
	onRemove: (id: number) => void
}

function RelationBucket({ bucket, rows, people, dependents, ops, onRemove }: RelationBucketProps) {
	const queryClient = useQueryClient()
	const [adding, setAdding] = useState(false)
	const [pickerValue, setPickerValue] = useState('')

	const claimedIds = new Set(rows.map(r => `${r.target.kind}:${r.target.id}`))

	const addMutation = useMutation({
		mutationFn: async (value: string) => {
			const [kind, id] = value.split(':') as ['u' | 'd', string]
			return await ops.add({
				label: bucket.label,
				targetUserId: kind === 'u' ? id : undefined,
				targetDependentId: kind === 'd' ? id : undefined,
			})
		},
		onSuccess: result => {
			const r = result as { kind: 'ok' | 'error'; reason?: string }
			if (r.kind === 'error') {
				const message: Record<string, string> = {
					'invalid-target': 'Pick someone before saving.',
					'self-target': "You can't add yourself.",
					duplicate: 'They’re already in this list.',
					'target-not-found': "Couldn't find that person.",
					'not-dependent-guardian': 'You’re not a guardian of that dependent.',
				}
				toast.error(message[r.reason ?? ''] ?? 'Failed to add')
				return
			}
			setAdding(false)
			setPickerValue('')
			queryClient.invalidateQueries({ queryKey: ops.listKey })
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
