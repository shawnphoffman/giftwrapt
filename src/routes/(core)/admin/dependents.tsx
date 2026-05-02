'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Sprout, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { getUsersAsAdmin } from '@/api/admin'
import {
	addDependentGuardian,
	createDependent,
	deleteDependent,
	type DependentSummary,
	getAllDependents,
	removeDependentGuardian,
	updateDependent,
} from '@/api/dependents'
import { BirthDaySelect } from '@/components/common/birth-day-select'
import DependentAvatar from '@/components/common/dependent-avatar'
import UserAvatar from '@/components/common/user-avatar'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type BirthMonth, birthMonthEnumValues } from '@/db/schema/enums'

export const Route = createFileRoute('/(core)/admin/dependents')({
	component: AdminDependentsPage,
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

type AdminUser = {
	id: string
	name: string | null
	email: string
	image: string | null
	role: string
}

function AdminDependentsPage() {
	const queryClient = useQueryClient()

	const dependentsQuery = useQuery({
		queryKey: ['admin', 'dependents'],
		queryFn: () => getAllDependents(),
		staleTime: 60 * 1000,
	})

	const usersQuery = useQuery({
		queryKey: ['admin', 'users'],
		queryFn: () => getUsersAsAdmin(),
		staleTime: 5 * 60 * 1000,
	})

	const eligibleGuardians = (usersQuery.data ?? []).filter(u => u.role !== 'child')

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ['admin', 'dependents'] })
		queryClient.invalidateQueries({ queryKey: ['dependents', 'mine'] })
		queryClient.invalidateQueries({ queryKey: ['my-lists'] })
		queryClient.invalidateQueries({ queryKey: ['lists'] })
	}

	return (
		<>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl flex items-center gap-2">
						<Sprout className="size-5 text-emerald-600" />
						Add Dependent
					</CardTitle>
					<CardDescription>
						Create a non-user gift recipient (pet, baby, or anyone managed by another user). Pick at least one guardian.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<CreateDependentForm guardians={eligibleGuardians} onCreated={invalidate} />
				</CardContent>
			</Card>

			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Dependents</CardTitle>
					<CardDescription>Edit, remove, or change the guardians for any dependent.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{dependentsQuery.isLoading ? (
						<LoadingSkeleton />
					) : !dependentsQuery.data || dependentsQuery.data.dependents.length === 0 ? (
						<div className="text-sm text-muted-foreground py-6 text-center">No dependents yet.</div>
					) : (
						dependentsQuery.data.dependents.map(d => (
							<AdminDependentRow key={d.id} dependent={d} eligibleGuardians={eligibleGuardians} onChanged={invalidate} />
						))
					)}
				</CardContent>
			</Card>
		</>
	)
}

function CreateDependentForm({ guardians, onCreated }: { guardians: Array<AdminUser>; onCreated: () => void }) {
	const [name, setName] = useState('')
	const [birthMonth, setBirthMonth] = useState<BirthMonth | ''>('')
	const [birthDay, setBirthDay] = useState<number | undefined>(undefined)
	const [birthYear, setBirthYear] = useState('')
	const [selectedGuardianIds, setSelectedGuardianIds] = useState<Array<string>>([])

	const mutation = useMutation({
		mutationFn: () =>
			createDependent({
				data: {
					name: name.trim(),
					birthMonth: birthMonth || null,
					birthDay: birthDay ?? null,
					birthYear: birthYear ? parseInt(birthYear, 10) : null,
					guardianIds: selectedGuardianIds,
				},
			}),
		onSuccess: result => {
			if (result.kind === 'error') {
				toast.error(`Couldn't add: ${result.reason}`)
				return
			}
			toast.success(`${result.dependent.name} added`)
			setName('')
			setBirthMonth('')
			setBirthDay(undefined)
			setBirthYear('')
			setSelectedGuardianIds([])
			onCreated()
		},
		onError: () => toast.error("Couldn't add dependent"),
	})

	const canSubmit = name.trim().length > 0 && selectedGuardianIds.length > 0 && !mutation.isPending

	const remainingGuardians = guardians.filter(u => !selectedGuardianIds.includes(u.id))
	const selectedGuardians = selectedGuardianIds.map(id => guardians.find(u => u.id === id)).filter((u): u is AdminUser => Boolean(u))

	return (
		<form
			onSubmit={e => {
				e.preventDefault()
				if (!canSubmit) return
				mutation.mutate()
			}}
			className="space-y-4"
		>
			<div className="grid gap-2 max-w-md">
				<Label htmlFor="dep-name">Name</Label>
				<Input id="dep-name" value={name} onChange={e => setName(e.target.value)} placeholder="Mochi" maxLength={60} />
			</div>

			<div className="space-y-2">
				<Label>Guardians (required)</Label>
				<div className="text-xs text-muted-foreground -mt-1">
					Users who manage this dependent and see them on /me, /received, and create-list pickers.
				</div>
				<div className="flex flex-wrap gap-2">
					{selectedGuardians.map(g => (
						<button
							key={g.id}
							type="button"
							onClick={() => setSelectedGuardianIds(prev => prev.filter(x => x !== g.id))}
							className="inline-flex items-center gap-2 rounded-full border bg-muted/50 pl-1 pr-2 py-1 text-xs hover:bg-muted"
						>
							<UserAvatar name={g.name || g.email} image={g.image} size="small" />
							<span>{g.name || g.email}</span>
							<X className="size-3" />
						</button>
					))}
					{remainingGuardians.length > 0 && (
						<Select
							value=""
							onValueChange={id => {
								if (id) setSelectedGuardianIds(prev => [...prev, id])
							}}
						>
							<SelectTrigger className="w-44 text-xs">
								<SelectValue placeholder={selectedGuardians.length ? 'Add another...' : 'Pick a guardian'} />
							</SelectTrigger>
							<SelectContent>
								{remainingGuardians.map(u => (
									<SelectItem key={u.id} value={u.id}>
										<UserAvatar name={u.name || u.email} image={u.image} size="small" />
										<span className="truncate">{u.name || u.email}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>
			</div>

			<details className="rounded-md border">
				<summary className="cursor-pointer text-sm px-3 py-2 select-none">Birthday (optional)</summary>
				<div className="grid grid-cols-3 gap-2 p-3 pt-0">
					<div className="space-y-1">
						<Label htmlFor="dep-month">Month</Label>
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
							min={1900}
							max={new Date().getFullYear()}
						/>
					</div>
				</div>
			</details>

			<Button type="submit" disabled={!canSubmit}>
				<Plus className="size-4" /> {mutation.isPending ? 'Adding...' : 'Add dependent'}
			</Button>
		</form>
	)
}

type AdminDependent = DependentSummary & {
	guardians: Array<{ id: string; name: string | null; email: string; image: string | null }>
}

function AdminDependentRow({
	dependent,
	eligibleGuardians,
	onChanged,
}: {
	dependent: AdminDependent
	eligibleGuardians: Array<AdminUser>
	onChanged: () => void
}) {
	const [editing, setEditing] = useState(false)
	const [name, setName] = useState(dependent.name)
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
	// Guardian id pending removal confirmation, or null when no prompt is open.
	const [pendingGuardianRemoval, setPendingGuardianRemoval] = useState<string | null>(null)

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
		onError: () => toast.error("Couldn't update"),
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
		onError: () => toast.error("Couldn't delete"),
	})

	const addGuardianMutation = useMutation({
		mutationFn: (userId: string) => addDependentGuardian({ data: { dependentId: dependent.id, userId } }),
		onSuccess: result => {
			if (result.kind === 'error') {
				toast.error(`Couldn't add guardian: ${result.reason}`)
				return
			}
			onChanged()
		},
		onError: () => toast.error("Couldn't add guardian"),
	})

	const removeGuardianMutation = useMutation({
		mutationFn: (userId: string) => removeDependentGuardian({ data: { dependentId: dependent.id, userId } }),
		onSuccess: result => {
			if (result.kind === 'error') {
				toast.error(`Couldn't remove guardian: ${result.reason}`)
				return
			}
			onChanged()
		},
		onError: () => toast.error("Couldn't remove guardian"),
	})

	const guardianIdSet = new Set(dependent.guardianIds)
	const remainingGuardians = eligibleGuardians.filter(u => !guardianIdSet.has(u.id))

	const birthLabel = dependent.birthMonth
		? `${monthLabels[dependent.birthMonth]}${dependent.birthDay ? ` ${dependent.birthDay}` : ''}${dependent.birthYear ? `, ${dependent.birthYear}` : ''}`
		: null

	return (
		<div className="rounded-md border p-3 space-y-3">
			<div className="flex items-center gap-3">
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
							<div className="font-medium truncate flex items-center gap-2">
								{dependent.name}
								{dependent.isArchived && <span className="text-xs text-muted-foreground italic">(archived)</span>}
							</div>
							<div className="text-xs text-muted-foreground">{birthLabel ?? 'Click to rename'}</div>
						</button>
					)}
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setConfirmDeleteOpen(true)}
					disabled={deleteMutation.isPending}
					aria-label={`Delete ${dependent.name}`}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>

			<div className="flex flex-wrap items-center gap-2 pl-13">
				<span className="text-xs text-muted-foreground">Guardians:</span>
				{dependent.guardians.length === 0 && <span className="text-xs italic text-destructive">No guardians (unmanageable!)</span>}
				{dependent.guardians.map(g => (
					<button
						key={g.id}
						type="button"
						onClick={() => {
							if (dependent.guardians.length <= 1) {
								toast.error("Can't remove the last guardian.")
								return
							}
							setPendingGuardianRemoval(g.id)
						}}
						disabled={removeGuardianMutation.isPending}
						className="inline-flex items-center gap-2 rounded-full border bg-muted/50 pl-1 pr-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50"
					>
						<UserAvatar name={g.name || g.email} image={g.image} size="small" />
						<span>{g.name || g.email}</span>
						<X className="size-3" />
					</button>
				))}
				{remainingGuardians.length > 0 && (
					<Select
						value=""
						onValueChange={id => {
							if (id) addGuardianMutation.mutate(id)
						}}
					>
						<SelectTrigger className="w-40 h-7 text-xs">
							<SelectValue placeholder="Add guardian..." />
						</SelectTrigger>
						<SelectContent>
							{remainingGuardians.map(u => (
								<SelectItem key={u.id} value={u.id}>
									<UserAvatar name={u.name || u.email} image={u.image} size="small" />
									<span className="truncate">{u.name || u.email}</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>

			<AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {dependent.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							Lists for {dependent.name} that already have received gifts will be archived (kept for history); everything else is removed
							permanently.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={async e => {
								e.preventDefault()
								await deleteMutation.mutateAsync()
								setConfirmDeleteOpen(false)
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={pendingGuardianRemoval !== null} onOpenChange={open => !open && setPendingGuardianRemoval(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove guardian?</AlertDialogTitle>
						<AlertDialogDescription>
							{(() => {
								const g = dependent.guardians.find(x => x.id === pendingGuardianRemoval)
								return `${g?.name || g?.email || 'This user'} will no longer manage ${dependent.name} and will lose edit access on their lists.`
							})()}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={removeGuardianMutation.isPending}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={removeGuardianMutation.isPending}
							onClick={async e => {
								e.preventDefault()
								if (pendingGuardianRemoval) {
									await removeGuardianMutation.mutateAsync(pendingGuardianRemoval)
								}
								setPendingGuardianRemoval(null)
							}}
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
