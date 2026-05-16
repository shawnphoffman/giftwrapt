import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { getUsersAsAdmin } from '@/api/admin'
import { addDependentGuardian, deleteDependent, type DependentSummary, removeDependentGuardian, updateDependent } from '@/api/dependents'
import UserAvatar from '@/components/common/user-avatar'
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type BirthMonth, birthMonthEnumValues } from '@/db/schema/enums'

import { BirthDaySelect } from '../common/birth-day-select'
import DependentAvatar from '../common/dependent-avatar'

type AdminUser = {
	id: string
	name: string | null
	email: string
	image: string | null
	role: string
}

type AdminDependent = DependentSummary & {
	guardians: Array<{ id: string; name: string | null; email: string; image: string | null }>
}

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

export function EditDependentDialog({
	dependent,
	open,
	onOpenChange,
}: {
	dependent: AdminDependent
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const queryClient = useQueryClient()

	const usersQuery = useQuery({
		queryKey: ['admin', 'users'],
		queryFn: () => getUsersAsAdmin(),
		staleTime: 5 * 60 * 1000,
	})
	const eligibleGuardians: Array<AdminUser> = (usersQuery.data ?? []).filter(u => u.role !== 'child')

	// Local state for the rename / birthday fields. Re-seeded whenever the
	// dialog opens with a (possibly different) dependent so stale edits from
	// a previous open don't leak in.
	const [name, setName] = useState(dependent.name)
	const [birthMonth, setBirthMonth] = useState<BirthMonth | ''>(dependent.birthMonth ?? '')
	const [birthDay, setBirthDay] = useState<number | undefined>(dependent.birthDay ?? undefined)
	const [birthYear, setBirthYear] = useState<string>(dependent.birthYear ? String(dependent.birthYear) : '')
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
	const [pendingGuardianRemoval, setPendingGuardianRemoval] = useState<string | null>(null)

	useEffect(() => {
		if (open) {
			setName(dependent.name)
			setBirthMonth(dependent.birthMonth ?? '')
			setBirthDay(dependent.birthDay ?? undefined)
			setBirthYear(dependent.birthYear ? String(dependent.birthYear) : '')
		}
	}, [open, dependent.id, dependent.name, dependent.birthMonth, dependent.birthDay, dependent.birthYear])

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ['admin', 'dependents'] })
		queryClient.invalidateQueries({ queryKey: ['dependents', 'mine'] })
		queryClient.invalidateQueries({ queryKey: ['my-lists'] })
		queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'dependents'] })
		queryClient.invalidateQueries({ queryKey: ['permissions-matrix'] })
	}

	const saveMutation = useMutation({
		mutationFn: () =>
			updateDependent({
				data: {
					id: dependent.id,
					name: name.trim(),
					birthMonth: birthMonth || null,
					birthDay: birthDay ?? null,
					birthYear: birthYear ? parseInt(birthYear, 10) : null,
				},
			}),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(`Couldn't update: ${r.reason}`)
			toast.success('Updated')
			invalidate()
			onOpenChange(false)
		},
		onError: () => toast.error("Couldn't update"),
	})

	const deleteMutation = useMutation({
		mutationFn: () => deleteDependent({ data: { id: dependent.id } }),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(`Couldn't delete: ${r.reason}`)
			toast.success(r.action === 'archived' ? `${dependent.name} archived (had gift history)` : `${dependent.name} deleted`)
			invalidate()
			setConfirmDeleteOpen(false)
			onOpenChange(false)
		},
		onError: () => toast.error("Couldn't delete"),
	})

	const addGuardianMutation = useMutation({
		mutationFn: (userId: string) => addDependentGuardian({ data: { dependentId: dependent.id, userId } }),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(`Couldn't add guardian: ${r.reason}`)
			invalidate()
		},
		onError: () => toast.error("Couldn't add guardian"),
	})

	const removeGuardianMutation = useMutation({
		mutationFn: (userId: string) => removeDependentGuardian({ data: { dependentId: dependent.id, userId } }),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(`Couldn't remove guardian: ${r.reason}`)
			invalidate()
		},
		onError: () => toast.error("Couldn't remove guardian"),
	})

	const guardianIdSet = new Set(dependent.guardianIds)
	const remainingGuardians = eligibleGuardians.filter(u => !guardianIdSet.has(u.id))

	const dirty =
		name.trim() !== dependent.name ||
		(birthMonth || null) !== (dependent.birthMonth ?? null) ||
		(birthDay ?? null) !== (dependent.birthDay ?? null) ||
		(birthYear ? parseInt(birthYear, 10) : null) !== (dependent.birthYear ?? null)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-3">
						<DependentAvatar name={dependent.name} image={dependent.image} size="medium" />
						<span>Edit {dependent.name}</span>
						{dependent.isArchived && <span className="text-[10px] uppercase tracking-wide text-muted-foreground italic">archived</span>}
					</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={e => {
						e.preventDefault()
						if (!name.trim() || !dirty) return
						saveMutation.mutate()
					}}
					className="space-y-4"
				>
					<div className="grid gap-2">
						<Label htmlFor="edit-dep-name">Name</Label>
						<Input
							id="edit-dep-name"
							value={name}
							onChange={e => setName(e.target.value)}
							maxLength={60}
							disabled={saveMutation.isPending}
						/>
					</div>

					<div className="grid grid-cols-3 gap-2">
						<div className="space-y-1">
							<Label htmlFor="edit-dep-month">Birth Month</Label>
							<Select value={birthMonth} onValueChange={v => setBirthMonth(v as BirthMonth)} disabled={saveMutation.isPending}>
								<SelectTrigger id="edit-dep-month">
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
							<Label htmlFor="edit-dep-day">Day</Label>
							<BirthDaySelect
								id="edit-dep-day"
								month={birthMonth || undefined}
								value={birthDay}
								onValueChange={setBirthDay}
								disabled={saveMutation.isPending}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="edit-dep-year">Year</Label>
							<Input
								id="edit-dep-year"
								type="number"
								value={birthYear}
								onChange={e => setBirthYear(e.target.value)}
								min={1900}
								max={new Date().getFullYear()}
								disabled={saveMutation.isPending}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label>Guardians</Label>
						<div className="flex flex-wrap items-center gap-2">
							{dependent.guardians.length === 0 && <span className="text-xs italic text-destructive">No guardians (unmanageable!)</span>}
							{dependent.guardians.map((g, i) => {
								const label = g.name || g.email
								const isTopmost = i === dependent.guardians.length - 1
								return (
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
										className="inline-flex items-center gap-2 rounded-full border bg-muted/50 pl-1 pr-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
										aria-label={`Remove guardian ${label}`}
									>
										<span className="relative inline-flex">
											<UserAvatar name={label} image={g.image} size="small" />
											{isTopmost && (
												<ShieldCheck className="absolute -bottom-0.5 -right-0.5 size-3 fill-emerald-500 text-white dark:text-background stroke-[2.5] drop-shadow-sm" />
											)}
										</span>
										<span>{label}</span>
										<X className="size-3" />
									</button>
								)
							})}
							{remainingGuardians.length > 0 && (
								<Select
									value=""
									onValueChange={id => {
										if (id) addGuardianMutation.mutate(id)
									}}
								>
									<SelectTrigger size="sm" className="w-44 text-xs">
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
					</div>

					<DialogFooter className="!justify-between sm:!justify-between">
						<Button
							type="button"
							variant="outline"
							className="text-destructive hover:text-destructive hover:bg-destructive/10"
							onClick={() => setConfirmDeleteOpen(true)}
							disabled={saveMutation.isPending || deleteMutation.isPending}
						>
							<Trash2 className="size-4" /> Delete
						</Button>
						<div className="flex items-center gap-2">
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>
								Cancel
							</Button>
							<Button type="submit" disabled={saveMutation.isPending || !dirty || !name.trim()}>
								{saveMutation.isPending ? 'Saving...' : 'Save'}
							</Button>
						</div>
					</DialogFooter>
				</form>

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
							<AlertDialogTitle>Remove Guardian?</AlertDialogTitle>
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
			</DialogContent>
		</Dialog>
	)
}
