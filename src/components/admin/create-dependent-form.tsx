import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { getUsersAsAdmin } from '@/api/admin'
import { createDependent } from '@/api/dependents'
import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type BirthMonth, birthMonthEnumValues } from '@/db/schema/enums'

import { BirthDaySelect } from '../common/birth-day-select'

type AdminUser = {
	id: string
	name: string | null
	email: string
	image: string | null
	role: string
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

export function CreateDependentForm({ onCreated }: { onCreated?: () => void } = {}) {
	const queryClient = useQueryClient()

	const usersQuery = useQuery({
		queryKey: ['admin', 'users'],
		queryFn: () => getUsersAsAdmin(),
		staleTime: 5 * 60 * 1000,
	})
	const guardians: Array<AdminUser> = (usersQuery.data ?? []).filter(u => u.role !== 'child')

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
			queryClient.invalidateQueries({ queryKey: ['admin', 'dependents'] })
			queryClient.invalidateQueries({ queryKey: ['dependents', 'mine'] })
			queryClient.invalidateQueries({ queryKey: ['my-lists'] })
			queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'dependents'] })
			queryClient.invalidateQueries({ queryKey: ['permissions-matrix'] })
			onCreated?.()
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
			<div className="grid gap-2">
				<Label htmlFor="dep-name">Name</Label>
				<Input id="dep-name" value={name} onChange={e => setName(e.target.value)} placeholder="Mochi" maxLength={60} />
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
						min={1900}
						max={new Date().getFullYear()}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label>Guardians (required)</Label>
				<div className="text-xs text-muted-foreground -mt-1">Users who manage this dependent.</div>
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

			<Button type="submit" disabled={!canSubmit}>
				<Plus className="size-4" /> {mutation.isPending ? 'Adding...' : 'Add dependent'}
			</Button>
		</form>
	)
}
