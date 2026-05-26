// Admin UI for the curated custom_holidays table. Replaces the legacy
// HolidayCatalogSection. Two add-flow modes via local toggle state:
//
//   - From catalog: country picker → catalog candidate list, filtered
//     to a gift-giving inclusion set. Stores source='catalog' with the
//     (country, slug) pair.
//   - Custom: title + month/day + "repeats annually" checkbox + optional
//     year (when annual=false). Stores source='custom' with raw date
//     fields.
//
// Delete cascades affected lists to the deployment's defaultListType
// without clearing claims (admin-cascade exception in
// _custom-holidays-impl.ts).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
	addCatalogCustomHolidayAsAdmin,
	addCustomCustomHolidayAsAdmin,
	type AdminCustomHoliday,
	deleteCustomHolidayAsAdmin,
	listCatalogCandidatesAsAdmin,
	listCustomHolidaysAsAdmin,
	listRecipientCandidatesAsAdmin,
	type RecipientCandidate,
	updateCustomHolidayAsAdmin,
} from '@/api/custom-holidays'
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
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppSetting } from '@/hooks/use-app-settings'
import { SUPPORTED_COUNTRIES } from '@/lib/holidays-countries'

const MONTHS: ReadonlyArray<{ value: string; label: string; days: number }> = [
	{ value: '1', label: 'January', days: 31 },
	{ value: '2', label: 'February', days: 29 },
	{ value: '3', label: 'March', days: 31 },
	{ value: '4', label: 'April', days: 30 },
	{ value: '5', label: 'May', days: 31 },
	{ value: '6', label: 'June', days: 30 },
	{ value: '7', label: 'July', days: 31 },
	{ value: '8', label: 'August', days: 31 },
	{ value: '9', label: 'September', days: 30 },
	{ value: '10', label: 'October', days: 31 },
	{ value: '11', label: 'November', days: 30 },
	{ value: '12', label: 'December', days: 31 },
]

const customHolidaysQueryKey = ['admin-custom-holidays'] as const
const recipientCandidatesQueryKey = ['admin-custom-holidays-recipients'] as const

function formatNextOccurrence(iso: string | null): string {
	if (!iso) return 'No upcoming date'
	try {
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
	} catch {
		return iso
	}
}

// Wire-format encoding for the recipient picker: 'none' (broadcast),
// 'u:<userId>', or 'd:<dependentId>'. Mirrors the relation-labels
// picker pattern so we get one consistent Select shape for "pick a
// user or a dependent".
type RecipientValue = 'none' | `u:${string}` | `d:${string}`

function recipientValueToInput(
	value: RecipientValue
): { kind: 'none' } | { kind: 'user'; userId: string } | { kind: 'dependent'; dependentId: string } {
	if (value === 'none') return { kind: 'none' }
	if (value.startsWith('u:')) return { kind: 'user', userId: value.slice(2) }
	return { kind: 'dependent', dependentId: value.slice(2) }
}

function recipientValueFromRow(row: AdminCustomHoliday): RecipientValue {
	if (row.recipientUserId) return `u:${row.recipientUserId}`
	if (row.recipientDependentId) return `d:${row.recipientDependentId}`
	return 'none'
}

function RecipientPicker({
	value,
	onChange,
	candidates,
	disabled,
	id,
}: {
	value: RecipientValue
	onChange: (next: RecipientValue) => void
	candidates: ReadonlyArray<RecipientCandidate>
	disabled?: boolean
	id?: string
}) {
	const users = candidates.filter(c => c.kind === 'user')
	const dependents = candidates.filter(c => c.kind === 'dependent')
	return (
		<Select value={value} onValueChange={v => onChange(v as RecipientValue)} disabled={disabled}>
			<SelectTrigger id={id} className="flex-1">
				<SelectValue placeholder="Everyone (broadcast)" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="none">Everyone (broadcast)</SelectItem>
				{users.length > 0 && (
					<>
						<div className="px-2 pt-2 text-xs font-medium text-muted-foreground">Users</div>
						{users.map(u => (
							<SelectItem key={`u:${u.id}`} value={`u:${u.id}`}>
								{u.name}
							</SelectItem>
						))}
					</>
				)}
				{dependents.length > 0 && (
					<>
						<div className="px-2 pt-2 text-xs font-medium text-muted-foreground">Dependents</div>
						{dependents.map(d => (
							<SelectItem key={`d:${d.id}`} value={`d:${d.id}`}>
								{d.name}
							</SelectItem>
						))}
					</>
				)}
			</SelectContent>
		</Select>
	)
}

function RecipientChip({ row }: { row: AdminCustomHoliday }) {
	if (row.recipientUserId && row.recipientUserName) {
		return (
			<span className="inline-flex items-center gap-1">
				<UserAvatar name={row.recipientUserName} image={null} size="small" />
				<span>for {row.recipientUserName}</span>
			</span>
		)
	}
	if (row.recipientDependentId && row.recipientDependentName) {
		return (
			<span className="inline-flex items-center gap-1">
				<DependentAvatar name={row.recipientDependentName} image={null} size="small" />
				<span>for {row.recipientDependentName}</span>
			</span>
		)
	}
	return <span className="text-muted-foreground">Everyone</span>
}

export function CustomHolidaysSection() {
	// Gated on the master "deployment celebrates generic holidays" toggle.
	// Disabling it everywhere (cron, widget, list-creation) - admin
	// shouldn't be able to curate rows that nothing surfaces. Existing
	// rows persist in the DB; flipping the toggle back on reveals them
	// again with no data loss.
	const enabled = useAppSetting('enableGenericHolidayLists')

	const query = useQuery({
		queryKey: customHolidaysQueryKey,
		queryFn: () => listCustomHolidaysAsAdmin(),
		enabled,
	})

	if (!enabled) {
		return (
			<div className="text-sm text-muted-foreground">
				Holiday lists are disabled for this deployment. Turn on <span className="font-medium">Enable Holiday Lists</span> above to curate
				custom holidays.
			</div>
		)
	}

	const rows = query.data ?? []

	return (
		<div className="space-y-4">
			<div className="flex justify-end gap-2">
				<AddFromCatalogDialog />
				<AddCustomDialog />
			</div>

			{query.isLoading ? (
				<div className="text-sm text-muted-foreground">Loading...</div>
			) : rows.length === 0 ? (
				<div className="text-sm text-muted-foreground">No custom holidays yet. Add one to enable holiday-typed lists.</div>
			) : (
				<ul className="flex flex-col gap-2">
					{rows.map(row => (
						<CustomHolidayRow key={row.id} row={row} />
					))}
				</ul>
			)}
		</div>
	)
}

function useRecipientCandidates(enabled: boolean) {
	return useQuery({
		queryKey: recipientCandidatesQueryKey,
		queryFn: () => listRecipientCandidatesAsAdmin(),
		enabled,
	})
}

function CustomHolidayRow({ row }: { row: AdminCustomHoliday }) {
	const qc = useQueryClient()
	const [editing, setEditing] = useState(false)
	const [title, setTitle] = useState(row.title)
	const [editingRecipient, setEditingRecipient] = useState(false)
	const candidatesQuery = useRecipientCandidates(editingRecipient)

	const updateTitle = useMutation({
		mutationFn: async (newTitle: string) => {
			const result = await updateCustomHolidayAsAdmin({ data: { id: row.id, title: newTitle } })
			if (result.kind === 'error') throw new Error(result.reason)
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: customHolidaysQueryKey }),
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to update holiday'),
	})

	const updateRecipient = useMutation({
		mutationFn: async (value: RecipientValue) => {
			const result = await updateCustomHolidayAsAdmin({ data: { id: row.id, recipient: recipientValueToInput(value) } })
			if (result.kind === 'error') throw new Error(result.reason)
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: customHolidaysQueryKey })
			setEditingRecipient(false)
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to update recipient'),
	})

	const remove = useMutation({
		mutationFn: async () => {
			const result = await deleteCustomHolidayAsAdmin({ data: { id: row.id } })
			if (result.kind === 'error') throw new Error(result.reason)
			return result
		},
		onSuccess: result => {
			qc.invalidateQueries({ queryKey: customHolidaysQueryKey })
			if (result.convertedListCount > 0) {
				toast.success(`Deleted. Converted ${result.convertedListCount} list(s) to the default type.`)
			} else {
				toast.success('Deleted.')
			}
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to delete holiday'),
	})

	const sourceLabel = row.source === 'catalog' ? `Catalog (${row.catalogCountry})` : 'Custom'

	return (
		<li className="flex flex-wrap items-center gap-2 rounded border border-border bg-card p-3">
			<div className="flex-1 min-w-0">
				{editing ? (
					<form
						className="flex gap-1"
						onSubmit={e => {
							e.preventDefault()
							const trimmed = title.trim()
							if (!trimmed || trimmed === row.title) {
								setTitle(row.title)
								setEditing(false)
								return
							}
							updateTitle.mutate(trimmed, { onSuccess: () => setEditing(false) })
						}}
					>
						<Input value={title} onChange={e => setTitle(e.target.value)} autoFocus className="h-8" />
						<Button type="submit" size="sm" disabled={updateTitle.isPending}>
							Save
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => {
								setTitle(row.title)
								setEditing(false)
							}}
						>
							Cancel
						</Button>
					</form>
				) : (
					<button
						type="button"
						className="text-left hover:underline"
						onClick={() => {
							setTitle(row.title)
							setEditing(true)
						}}
					>
						<span className="font-medium">{row.title}</span>
					</button>
				)}
				<div className="text-xs text-muted-foreground">
					{sourceLabel} · Next: {formatNextOccurrence(row.nextOccurrenceIso)}
					{row.usageCount > 0 && ` · Used by ${row.usageCount} list${row.usageCount === 1 ? '' : 's'}`}
				</div>
				<div className="mt-1 flex items-center gap-2 text-xs">
					{editingRecipient ? (
						<>
							<RecipientPicker
								value={recipientValueFromRow(row)}
								onChange={v => updateRecipient.mutate(v)}
								candidates={candidatesQuery.data ?? []}
								disabled={updateRecipient.isPending}
							/>
							<Button
								type="button"
								size="xs"
								variant="outline"
								onClick={() => setEditingRecipient(false)}
								disabled={updateRecipient.isPending}
							>
								Cancel
							</Button>
						</>
					) : (
						<button type="button" className="text-left hover:underline" onClick={() => setEditingRecipient(true)}>
							<RecipientChip row={row} />
						</button>
					)}
				</div>
			</div>
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button variant="outline" size="xs" aria-label="Delete">
						<Trash2 className="size-4" />
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{row.title}"?</AlertDialogTitle>
						<AlertDialogDescription>
							{row.usageCount > 0
								? `${row.usageCount} list${row.usageCount === 1 ? '' : 's'} reference${row.usageCount === 1 ? 's' : ''} this holiday. They will be converted to the default list type. Claims will be preserved.`
								: 'No lists reference this holiday. Safe to delete.'}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</li>
	)
}

const PRIMARY_COUNTRY_ORDER: ReadonlyArray<string> = SUPPORTED_COUNTRIES.map(c => c.code)

function compareCandidates(a: { country: string; name: string }, b: { country: string; name: string }): number {
	const ai = PRIMARY_COUNTRY_ORDER.indexOf(a.country)
	const bi = PRIMARY_COUNTRY_ORDER.indexOf(b.country)
	const aRank = ai === -1 ? PRIMARY_COUNTRY_ORDER.length : ai
	const bRank = bi === -1 ? PRIMARY_COUNTRY_ORDER.length : bi
	if (aRank !== bRank) return aRank - bRank
	if (a.country !== b.country) return a.country.localeCompare(b.country)
	return a.name.localeCompare(b.name)
}

function AddFromCatalogDialog() {
	const qc = useQueryClient()
	const [open, setOpen] = useState(false)
	const [recipient, setRecipient] = useState<RecipientValue>('none')
	const recipientCandidatesQuery = useRecipientCandidates(open)

	const candidatesQuery = useQuery({
		queryKey: ['admin-custom-holidays-catalog-candidates'],
		queryFn: () => listCatalogCandidatesAsAdmin(),
		enabled: open,
	})

	const add = useMutation({
		mutationFn: async (args: { country: string; key: string }) => {
			const result = await addCatalogCustomHolidayAsAdmin({
				data: { ...args, recipient: recipientValueToInput(recipient) },
			})
			if (result.kind === 'error') throw new Error(result.reason)
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: customHolidaysQueryKey })
			qc.invalidateQueries({ queryKey: ['admin-custom-holidays-catalog-candidates'] })
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to add holiday'),
	})

	const candidates = [...(candidatesQuery.data ?? [])].sort(compareCandidates)

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				setOpen(next)
				if (!next) setRecipient('none')
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Plus className="size-4 mr-1" /> From Catalog
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Holiday From Catalog</DialogTitle>
					<DialogDescription>Curated gift-giving holidays for the supported countries.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="catalog-recipient">Recipient (optional)</Label>
					<RecipientPicker
						id="catalog-recipient"
						value={recipient}
						onChange={setRecipient}
						candidates={recipientCandidatesQuery.data ?? []}
						disabled={add.isPending}
					/>
					<p className="text-xs text-muted-foreground">Recipient-bound rows only surface to users who can view the recipient.</p>
				</div>
				<div className="flex flex-col gap-3">
					{candidatesQuery.isLoading ? (
						<p className="text-sm text-muted-foreground">Loading...</p>
					) : candidates.length === 0 ? (
						<p className="text-sm text-muted-foreground">No more gift-giving holidays available.</p>
					) : (
						<ul className="flex flex-col gap-1 max-h-96 overflow-auto">
							{candidates.map(c => (
								<li key={`${c.country}:${c.key}`} className="flex items-center justify-between gap-2 rounded border border-border p-2">
									<span>
										<span className="font-mono text-xs text-muted-foreground">{c.country}</span> - {c.name}
									</span>
									<Button size="sm" onClick={() => add.mutate({ country: c.country, key: c.key })} disabled={add.isPending}>
										Add
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function AddCustomDialog() {
	const qc = useQueryClient()
	const [open, setOpen] = useState(false)
	const [title, setTitle] = useState('')
	const [month, setMonth] = useState('')
	const [day, setDay] = useState('')
	const [annual, setAnnual] = useState(true)
	const [year, setYear] = useState(String(new Date().getUTCFullYear()))
	const [recipient, setRecipient] = useState<RecipientValue>('none')
	const recipientCandidatesQuery = useRecipientCandidates(open)

	const selectedMonth = MONTHS.find(m => m.value === month)
	const dayOptions = selectedMonth ? Array.from({ length: selectedMonth.days }, (_, i) => String(i + 1)) : []

	const add = useMutation({
		mutationFn: async () => {
			const result = await addCustomCustomHolidayAsAdmin({
				data: {
					title: title.trim(),
					month: Number(month),
					day: Number(day),
					year: annual ? null : Number(year),
					repeatsAnnually: annual,
					recipient: recipientValueToInput(recipient),
				},
			})
			if (result.kind === 'error') throw new Error(result.reason)
		},
		onSuccess: () => {
			setTitle('')
			setMonth('')
			setDay('')
			setAnnual(true)
			setYear(String(new Date().getUTCFullYear()))
			setRecipient('none')
			setOpen(false)
			qc.invalidateQueries({ queryKey: customHolidaysQueryKey })
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to add holiday'),
	})

	const canSubmit = title.trim().length > 0 && month !== '' && day !== '' && (annual || Number.isFinite(Number(year)))

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Plus className="size-4 mr-1" /> Custom
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Custom Holiday</DialogTitle>
					<DialogDescription>Define a holiday with a fixed date. Annual recurrence is the default.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="custom-title">Title</Label>
						<Input id="custom-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} autoFocus />
					</div>
					<div className="flex gap-2">
						<div className="flex flex-col gap-1.5 flex-1">
							<Label htmlFor="custom-month">Month</Label>
							<Select
								value={month}
								onValueChange={value => {
									setMonth(value)
									setDay('')
								}}
							>
								<SelectTrigger id="custom-month">
									<SelectValue placeholder="Select month" />
								</SelectTrigger>
								<SelectContent>
									{MONTHS.map(m => (
										<SelectItem key={m.value} value={m.value}>
											{m.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5 flex-1">
							<Label htmlFor="custom-day">Day</Label>
							<Select value={day} onValueChange={setDay} disabled={!selectedMonth}>
								<SelectTrigger id="custom-day">
									<SelectValue placeholder={selectedMonth ? 'Select day' : 'Pick a month first'} />
								</SelectTrigger>
								<SelectContent>
									{dayOptions.map(d => (
										<SelectItem key={d} value={d}>
											{d}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<label className="flex items-center gap-2 cursor-pointer">
						<Checkbox checked={annual} onCheckedChange={c => setAnnual(c === true)} />
						<span className="text-sm">Repeats annually</span>
					</label>
					{!annual && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="custom-year">Year</Label>
							<Input id="custom-year" type="number" min={1900} max={3000} value={year} onChange={e => setYear(e.target.value)} />
						</div>
					)}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="custom-recipient">Recipient (optional)</Label>
						<RecipientPicker
							id="custom-recipient"
							value={recipient}
							onChange={setRecipient}
							candidates={recipientCandidatesQuery.data ?? []}
							disabled={add.isPending}
						/>
						<p className="text-xs text-muted-foreground">Recipient-bound rows only surface to users who can view the recipient.</p>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button onClick={() => add.mutate()} disabled={!canSubmit || add.isPending}>
						Add
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
