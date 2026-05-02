'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Sprout, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { createDependent, deleteDependent, getMyDependents, updateDependent } from '@/api/dependents'
import { BirthDaySelect } from '@/components/common/birth-day-select'
import DependentAvatar from '@/components/common/dependent-avatar'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type BirthMonth, birthMonthEnumValues } from '@/db/schema/enums'

export const Route = createFileRoute('/(core)/settings/dependents')({
	component: DependentsSettingsPage,
})

const monthLabels: Record<BirthMonth, string> = {
	january: 'January',
	february: 'February',
	march: 'March',
	april: 'April',
	may: 'May',
	june: 'June',
	july: 'July',
	august: 'August',
	september: 'September',
	october: 'October',
	november: 'November',
	december: 'December',
}

function DependentsSettingsPage() {
	const queryClient = useQueryClient()
	const { data, isLoading } = useQuery({
		queryKey: ['dependents', 'mine'],
		queryFn: () => getMyDependents(),
		staleTime: 5 * 60 * 1000,
	})

	const [showCreate, setShowCreate] = useState(false)

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ['dependents', 'mine'] })
		queryClient.invalidateQueries({ queryKey: ['lists'] })
	}

	return (
		<div className="animate-page-in gap-6 flex flex-col">
			<CardHeader>
				<div className="flex items-start justify-between gap-4">
					<div>
						<CardTitle className="text-2xl flex items-center gap-2">
							<Sprout className="size-5 text-emerald-600" />
							Dependents
						</CardTitle>
						<CardDescription>
							People you manage that don't sign in themselves: a pet, a baby, or anyone else you receive gifts on behalf of.
						</CardDescription>
					</div>
					<Button size="sm" onClick={() => setShowCreate(true)} disabled={showCreate}>
						<Plus className="size-4" /> Add
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{showCreate && (
					<CreateDependentForm
						onDone={() => {
							setShowCreate(false)
							invalidate()
						}}
						onCancel={() => setShowCreate(false)}
					/>
				)}

				{isLoading ? (
					<LoadingSkeleton />
				) : !data || data.dependents.length === 0 ? (
					!showCreate && <div className="text-sm text-muted-foreground py-6 text-center">You haven't added any dependents yet.</div>
				) : (
					<div className="space-y-3">
						{data.dependents.map(d => (
							<DependentRow key={d.id} dependent={d} onChanged={invalidate} />
						))}
					</div>
				)}
			</CardContent>
		</div>
	)
}

function CreateDependentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
	const [name, setName] = useState('')
	const [birthMonth, setBirthMonth] = useState<BirthMonth | ''>('')
	const [birthDay, setBirthDay] = useState<number | undefined>(undefined)
	const [birthYear, setBirthYear] = useState<string>('')

	const mutation = useMutation({
		mutationFn: () =>
			createDependent({
				data: {
					name: name.trim(),
					birthMonth: birthMonth || null,
					birthDay: birthDay ?? null,
					birthYear: birthYear ? parseInt(birthYear, 10) : null,
					guardianIds: [],
				},
			}),
		onSuccess: result => {
			if (result.kind === 'error') {
				toast.error(`Couldn't add dependent: ${result.reason}`)
				return
			}
			toast.success(`${result.dependent.name} added`)
			onDone()
		},
		onError: () => toast.error("Couldn't add dependent"),
	})

	return (
		<form
			onSubmit={e => {
				e.preventDefault()
				if (!name.trim()) return
				mutation.mutate()
			}}
			className="rounded-md border p-4 space-y-3"
		>
			<div className="space-y-1">
				<Label htmlFor="dep-name">Name</Label>
				<Input id="dep-name" value={name} onChange={e => setName(e.target.value)} placeholder="Mochi" autoFocus maxLength={60} />
			</div>
			<div className="grid grid-cols-3 gap-2">
				<div className="space-y-1">
					<Label htmlFor="dep-month">Birth month</Label>
					<Select value={birthMonth} onValueChange={v => setBirthMonth(v as BirthMonth)}>
						<SelectTrigger id="dep-month">
							<SelectValue placeholder="(none)" />
						</SelectTrigger>
						<SelectContent>
							{birthMonthEnumValues.map(m => (
								<SelectItem key={m} value={m}>
									{monthLabels[m]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1">
					<Label htmlFor="dep-day">Day</Label>
					<BirthDaySelect id="dep-day" month={birthMonth || undefined} value={birthDay} onValueChange={setBirthDay} />
				</div>
				<div className="space-y-1">
					<Label htmlFor="dep-year">Year</Label>
					<Input
						id="dep-year"
						type="number"
						value={birthYear}
						onChange={e => setBirthYear(e.target.value)}
						placeholder="(optional)"
						min={1900}
						max={new Date().getFullYear()}
					/>
				</div>
			</div>
			<div className="flex justify-end gap-2 pt-2">
				<Button type="button" variant="ghost" onClick={onCancel} disabled={mutation.isPending}>
					Cancel
				</Button>
				<Button type="submit" disabled={mutation.isPending || !name.trim()}>
					{mutation.isPending ? 'Adding...' : 'Add dependent'}
				</Button>
			</div>
		</form>
	)
}

type DependentRowDependent = {
	id: string
	name: string
	image: string | null
	birthMonth: BirthMonth | null
	birthDay: number | null
	birthYear: number | null
	isArchived: boolean
	guardianIds: Array<string>
	createdByMe: boolean
}

function DependentRow({ dependent, onChanged }: { dependent: DependentRowDependent; onChanged: () => void }) {
	const [editing, setEditing] = useState(false)
	const [name, setName] = useState(dependent.name)

	const saveMutation = useMutation({
		mutationFn: () => updateDependent({ data: { id: dependent.id, name: name.trim() } }),
		onSuccess: result => {
			if (result.kind === 'error') {
				toast.error(`Couldn't update: ${result.reason}`)
				return
			}
			setEditing(false)
			toast.success('Updated')
			onChanged()
		},
		onError: () => toast.error("Couldn't update dependent"),
	})

	const deleteMutation = useMutation({
		mutationFn: () => deleteDependent({ data: { id: dependent.id } }),
		onSuccess: result => {
			if (result.kind === 'error') {
				toast.error(`Couldn't delete: ${result.reason}`)
				return
			}
			toast.success(result.action === 'archived' ? `${dependent.name} archived (had gift history)` : `${dependent.name} deleted`)
			onChanged()
		},
		onError: () => toast.error("Couldn't delete dependent"),
	})

	const birthLabel = dependent.birthMonth
		? `${monthLabels[dependent.birthMonth]}${dependent.birthDay ? ` ${dependent.birthDay}` : ''}${dependent.birthYear ? `, ${dependent.birthYear}` : ''}`
		: null

	return (
		<div className="flex items-center gap-3 rounded-md border p-3">
			<DependentAvatar name={dependent.name} image={dependent.image} size="medium" />
			<div className="flex-1 min-w-0">
				{editing ? (
					<form
						className="flex items-center gap-2"
						onSubmit={e => {
							e.preventDefault()
							if (!name.trim()) return
							saveMutation.mutate()
						}}
					>
						<Input value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus />
						<Button type="submit" size="sm" disabled={saveMutation.isPending || !name.trim()}>
							Save
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => {
								setEditing(false)
								setName(dependent.name)
							}}
						>
							Cancel
						</Button>
					</form>
				) : (
					<button type="button" onClick={() => setEditing(true)} className="text-left w-full">
						<div className="font-medium truncate">{dependent.name}</div>
						<div className="text-xs text-muted-foreground">{birthLabel ? `Birthday: ${birthLabel}` : 'Click to rename'}</div>
					</button>
				)}
			</div>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => {
					if (window.confirm(`Delete ${dependent.name}? Lists with received gifts will be archived rather than deleted.`)) {
						deleteMutation.mutate()
					}
				}}
				disabled={deleteMutation.isPending}
				aria-label={`Delete ${dependent.name}`}
			>
				<Trash2 className="size-4" />
			</Button>
		</div>
	)
}
