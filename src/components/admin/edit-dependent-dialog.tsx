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
import { useCurrentYear } from '@/hooks/use-current-year'
import { monthName } from '@/lib/i18n/labels'
import { m } from '@/paraglide/messages.js'

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
	const currentYear = useCurrentYear()
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
			if (r.kind === 'error') return toast.error(m.admin_users_dependent_update_error({ reason: r.reason }))
			toast.success(m.admin_users_dependent_updated_toast())
			invalidate()
			onOpenChange(false)
		},
		onError: () => toast.error(m.admin_users_dependent_update_failed()),
	})

	const deleteMutation = useMutation({
		mutationFn: () => deleteDependent({ data: { id: dependent.id } }),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(m.admin_users_dependent_delete_error({ reason: r.reason }))
			toast.success(
				r.action === 'archived'
					? m.admin_users_dependent_archived_toast({ name: dependent.name })
					: m.admin_users_dependent_deleted_toast({ name: dependent.name })
			)
			invalidate()
			setConfirmDeleteOpen(false)
			onOpenChange(false)
		},
		onError: () => toast.error(m.admin_users_dependent_delete_failed()),
	})

	const addGuardianMutation = useMutation({
		mutationFn: (userId: string) => addDependentGuardian({ data: { dependentId: dependent.id, userId } }),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(m.admin_users_dependent_add_guardian_error({ reason: r.reason }))
			invalidate()
		},
		onError: () => toast.error(m.admin_users_dependent_add_guardian_failed()),
	})

	const removeGuardianMutation = useMutation({
		mutationFn: (userId: string) => removeDependentGuardian({ data: { dependentId: dependent.id, userId } }),
		onSuccess: r => {
			if (r.kind === 'error') return toast.error(m.admin_users_dependent_remove_guardian_error({ reason: r.reason }))
			invalidate()
		},
		onError: () => toast.error(m.admin_users_dependent_remove_guardian_failed()),
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
						<span>{m.admin_users_dependent_edit_title({ name: dependent.name })}</span>
						{dependent.isArchived && (
							<span className="text-3xs uppercase tracking-wide text-muted-foreground italic">
								{m.admin_users_dependent_archived_tag()}
							</span>
						)}
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
						<Label htmlFor="edit-dep-name">{m.admin_users_dependent_name_label()}</Label>
						<Input
							id="edit-dep-name"
							autoComplete="off"
							data-1p-ignore
							data-lpignore="true"
							value={name}
							onChange={e => setName(e.target.value)}
							maxLength={60}
							disabled={saveMutation.isPending}
						/>
					</div>

					<div className="grid grid-cols-3 gap-2">
						<div className="space-y-1">
							<Label htmlFor="edit-dep-month">{m.admin_users_dependent_birth_month_label()}</Label>
							<Select value={birthMonth} onValueChange={v => setBirthMonth(v as BirthMonth)} disabled={saveMutation.isPending}>
								<SelectTrigger id="edit-dep-month">
									<SelectValue placeholder={m.admin_users_dependent_birth_month_placeholder()} />
								</SelectTrigger>
								<SelectContent>
									{birthMonthEnumValues.map(month => (
										<SelectItem key={month} value={month}>
											{monthName(month)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="edit-dep-day">{m.admin_users_dependent_birth_day_label()}</Label>
							<BirthDaySelect
								id="edit-dep-day"
								month={birthMonth || undefined}
								value={birthDay}
								onValueChange={setBirthDay}
								disabled={saveMutation.isPending}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="edit-dep-year">{m.admin_users_dependent_birth_year_label()}</Label>
							<Input
								id="edit-dep-year"
								type="number"
								value={birthYear}
								onChange={e => setBirthYear(e.target.value)}
								min={1900}
								max={currentYear}
								disabled={saveMutation.isPending}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label>{m.admin_users_dependent_guardians_label()}</Label>
						<div className="flex flex-wrap items-center gap-2">
							{dependent.guardians.length === 0 && (
								<span className="text-xs italic text-destructive">{m.admin_users_dependent_no_guardians_warning()}</span>
							)}
							{dependent.guardians.map((g, i) => {
								const label = g.name || g.email
								const isTopmost = i === dependent.guardians.length - 1
								return (
									<button
										key={g.id}
										type="button"
										onClick={() => {
											if (dependent.guardians.length <= 1) {
												toast.error(m.admin_users_dependent_last_guardian_error())
												return
											}
											setPendingGuardianRemoval(g.id)
										}}
										disabled={removeGuardianMutation.isPending}
										className="inline-flex items-center gap-2 rounded-full border bg-muted/50 pl-1 pr-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
										aria-label={m.admin_users_dependent_remove_guardian_aria({ name: label })}
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
										<SelectValue placeholder={m.admin_users_dependent_add_guardian_placeholder()} />
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
							<Trash2 className="size-4" /> {m.action_delete()}
						</Button>
						<div className="flex items-center gap-2">
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>
								{m.action_cancel()}
							</Button>
							<Button type="submit" disabled={saveMutation.isPending || !dirty || !name.trim()}>
								{saveMutation.isPending ? m.admin_users_dependent_saving() : m.action_save()}
							</Button>
						</div>
					</DialogFooter>
				</form>

				<AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{m.admin_users_dependent_delete_title({ name: dependent.name })}</AlertDialogTitle>
							<AlertDialogDescription>{m.admin_users_dependent_delete_body({ name: dependent.name })}</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={deleteMutation.isPending}>{m.action_cancel()}</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								disabled={deleteMutation.isPending}
								onClick={async e => {
									e.preventDefault()
									await deleteMutation.mutateAsync()
								}}
							>
								{m.action_delete()}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<AlertDialog open={pendingGuardianRemoval !== null} onOpenChange={next => !next && setPendingGuardianRemoval(null)}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{m.admin_users_dependent_remove_guardian_title()}</AlertDialogTitle>
							<AlertDialogDescription>
								{(() => {
									const g = dependent.guardians.find(x => x.id === pendingGuardianRemoval)
									const guardian = g?.name || g?.email
									return guardian
										? m.admin_users_dependent_remove_guardian_body({ guardian, name: dependent.name })
										: m.admin_users_dependent_remove_guardian_body_generic({ name: dependent.name })
								})()}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={removeGuardianMutation.isPending}>{m.action_cancel()}</AlertDialogCancel>
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
								{m.action_remove()}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</DialogContent>
		</Dialog>
	)
}
