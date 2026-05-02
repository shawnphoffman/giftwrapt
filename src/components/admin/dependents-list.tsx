import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Sprout, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { getUsersAsAdmin } from '@/api/admin'
import {
	addDependentGuardian,
	deleteDependent,
	type DependentSummary,
	getAllDependents,
	removeDependentGuardian,
	updateDependent,
} from '@/api/dependents'
import DependentAvatar from '@/components/common/dependent-avatar'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { BirthMonth } from '@/db/schema/enums'

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

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	)
}

// Mirrors `AdminUsersList`: same grid breakpoints so dependents and users
// line up column-for-column when stacked under a single Card.
export function AdminDependentsList() {
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
		queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'dependents'] })
		queryClient.invalidateQueries({ queryKey: ['permissions-matrix'] })
	}

	if (dependentsQuery.isLoading) {
		return (
			<div className="space-y-3">
				{[...Array(2)].map((_, i) => (
					<div key={i} className="flex items-center gap-3">
						<Skeleton className="h-10 w-10 rounded-full" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-48" />
						</div>
					</div>
				))}
			</div>
		)
	}

	if (!dependentsQuery.data || dependentsQuery.data.dependents.length === 0) {
		return <div className="text-sm text-muted-foreground">No dependents yet.</div>
	}

	return (
		<TooltipProvider delayDuration={150}>
			<div className="grid grid-cols-1 divide-y @sm/admin-content:grid-cols-[minmax(0,2fr)_max-content] @md/admin-content:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_max-content] @xl/admin-content:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_minmax(0,1.5fr)_max-content]">
				{dependentsQuery.data.dependents.map(d => (
					<DependentRow key={d.id} dependent={d} eligibleGuardians={eligibleGuardians} onChanged={invalidate} />
				))}
			</div>
		</TooltipProvider>
	)
}

function DependentRow({
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
	const [pendingGuardianRemoval, setPendingGuardianRemoval] = useState<string | null>(null)

	const saveMutation = useMutation({
		mutationFn: () => updateDependent({ data: { id: dependent.id, name: name.trim() } }),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(`Couldn't update: ${r.reason}`)
			setEditing(false)
			toast.success('Updated')
			onChanged()
		},
		onError: () => toast.error("Couldn't update"),
	})

	const deleteMutation = useMutation({
		mutationFn: () => deleteDependent({ data: { id: dependent.id } }),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(`Couldn't delete: ${r.reason}`)
			toast.success(r.action === 'archived' ? `${dependent.name} archived (had gift history)` : `${dependent.name} deleted`)
			onChanged()
		},
		onError: () => toast.error("Couldn't delete"),
	})

	const addGuardianMutation = useMutation({
		mutationFn: (userId: string) => addDependentGuardian({ data: { dependentId: dependent.id, userId } }),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(`Couldn't add guardian: ${r.reason}`)
			onChanged()
		},
		onError: () => toast.error("Couldn't add guardian"),
	})

	const removeGuardianMutation = useMutation({
		mutationFn: (userId: string) => removeDependentGuardian({ data: { dependentId: dependent.id, userId } }),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(`Couldn't remove guardian: ${r.reason}`)
			onChanged()
		},
		onError: () => toast.error("Couldn't remove guardian"),
	})

	const guardianIdSet = new Set(dependent.guardianIds)
	const remainingGuardians = eligibleGuardians.filter(u => !guardianIdSet.has(u.id))

	const monthName = dependent.birthMonth ? `${monthLabels[dependent.birthMonth]} ${dependent.birthDay ?? ''}`.trim() : null

	return (
		<div className="grid grid-cols-subgrid col-span-full items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
			{/* Identity */}
			<div className="flex items-center gap-3 min-w-0">
				<DependentAvatar name={dependent.name} image={dependent.image} />
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
							<Input value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus className="h-8 text-sm" />
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
						<>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => setEditing(true)}
									className="font-medium text-sm truncate hover:underline focus-visible:outline-none focus-visible:underline"
								>
									{dependent.name}
								</button>
								{dependent.isArchived && <span className="text-[10px] uppercase tracking-wide text-muted-foreground italic">archived</span>}
							</div>
							<div className="text-xs text-muted-foreground inline-flex items-center gap-1">
								<Sprout className="size-3 text-emerald-600" />
								Dependent
							</div>
						</>
					)}
				</div>
			</div>

			{/* Birthday */}
			<div className="hidden @xl/admin-content:flex items-center justify-start gap-1 min-w-0">
				{monthName && (
					<Tip label={`Birthday: ${monthName}${dependent.birthYear ? `, ${dependent.birthYear}` : ''}`}>
						<Badge variant="outline">{monthName}</Badge>
					</Tip>
				)}
			</div>

			{/* Guardians */}
			<div className="hidden @md/admin-content:flex items-center px-3 -space-x-2">
				{dependent.guardians.length === 0 && <span className="text-xs italic text-destructive">No guardians</span>}
				{dependent.guardians.map((g, i) => {
					const label = g.name || g.email
					const isTopmost = i === dependent.guardians.length - 1
					return (
						<Tip key={g.id} label={`Guardian: ${label} (click to remove)`}>
							<button
								type="button"
								onClick={() => {
									if (dependent.guardians.length <= 1) {
										toast.error("Can't remove the last guardian.")
										return
									}
									setPendingGuardianRemoval(g.id)
								}}
								disabled={removeGuardianMutation.isPending}
								className="relative inline-flex"
								aria-label={`Remove guardian ${label}`}
							>
								<UserAvatar name={label} image={g.image} size="small" className="ring-1 ring-border" />
								{isTopmost && (
									<ShieldCheck className="absolute -bottom-0.5 -right-0.5 size-3.5 fill-emerald-500 text-white dark:text-background stroke-[2.5] drop-shadow-sm" />
								)}
							</button>
						</Tip>
					)
				})}
				{remainingGuardians.length > 0 && (
					<Select
						value=""
						onValueChange={id => {
							if (id) addGuardianMutation.mutate(id)
						}}
					>
						<SelectTrigger size="sm" className="ml-2 h-7 w-32 text-xs">
							<SelectValue placeholder="Add..." />
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

			{/* Actions */}
			<div className="flex items-center justify-end">
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
