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
	updateCustomHolidayAsAdmin,
} from '@/api/custom-holidays'
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

const customHolidaysQueryKey = ['admin-custom-holidays'] as const

function formatNextOccurrence(iso: string | null): string {
	if (!iso) return 'No upcoming date'
	try {
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
	} catch {
		return iso
	}
}

export function CustomHolidaysSection() {
	const query = useQuery({
		queryKey: customHolidaysQueryKey,
		queryFn: () => listCustomHolidaysAsAdmin(),
	})

	const rows = query.data ?? []

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm text-muted-foreground">
					Holidays available when users create a holiday list. Add from the bundled catalog or define your own.
				</p>
				<div className="flex gap-2">
					<AddFromCatalogDialog />
					<AddCustomDialog />
				</div>
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

function CustomHolidayRow({ row }: { row: AdminCustomHoliday }) {
	const qc = useQueryClient()
	const [editing, setEditing] = useState(false)
	const [title, setTitle] = useState(row.title)

	const updateTitle = useMutation({
		mutationFn: async (newTitle: string) => {
			const result = await updateCustomHolidayAsAdmin({ data: { id: row.id, title: newTitle } })
			if (result.kind === 'error') throw new Error(result.reason)
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: customHolidaysQueryKey }),
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to update holiday'),
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
							variant="ghost"
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
			</div>
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button variant="ghost" size="sm" aria-label="Delete">
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

function AddFromCatalogDialog() {
	const qc = useQueryClient()
	const [open, setOpen] = useState(false)
	const [country, setCountry] = useState('US')

	const candidatesQuery = useQuery({
		queryKey: ['admin-custom-holidays-catalog-candidates', country],
		queryFn: () => listCatalogCandidatesAsAdmin({ data: { country } }),
		enabled: open,
	})

	const add = useMutation({
		mutationFn: async (key: string) => {
			const result = await addCatalogCustomHolidayAsAdmin({ data: { country, key } })
			if (result.kind === 'error') throw new Error(result.reason)
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: customHolidaysQueryKey })
			qc.invalidateQueries({ queryKey: ['admin-custom-holidays-catalog-candidates'] })
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to add holiday'),
	})

	const candidates = candidatesQuery.data ?? []

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Plus className="size-4 mr-1" /> From catalog
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add holiday from catalog</DialogTitle>
					<DialogDescription>Curated gift-giving holidays from the bundled date-holidays library.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<Label htmlFor="catalog-country">Country</Label>
						<Select value={country} onValueChange={setCountry}>
							<SelectTrigger id="catalog-country" className="w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="US">United States</SelectItem>
								<SelectItem value="CA">Canada</SelectItem>
								<SelectItem value="GB">United Kingdom</SelectItem>
								<SelectItem value="AU">Australia</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{candidatesQuery.isLoading ? (
						<p className="text-sm text-muted-foreground">Loading...</p>
					) : candidates.length === 0 ? (
						<p className="text-sm text-muted-foreground">No more gift-giving holidays available for {country}.</p>
					) : (
						<ul className="flex flex-col gap-1 max-h-72 overflow-auto">
							{candidates.map(c => (
								<li key={`${c.country}:${c.key}`} className="flex items-center justify-between gap-2 rounded border border-border p-2">
									<span>{c.name}</span>
									<Button size="sm" onClick={() => add.mutate(c.key)} disabled={add.isPending}>
										Add
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
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
	const [month, setMonth] = useState('1')
	const [day, setDay] = useState('1')
	const [annual, setAnnual] = useState(true)
	const [year, setYear] = useState(String(new Date().getUTCFullYear()))

	const add = useMutation({
		mutationFn: async () => {
			const result = await addCustomCustomHolidayAsAdmin({
				data: {
					title: title.trim(),
					month: Number(month),
					day: Number(day),
					year: annual ? null : Number(year),
					repeatsAnnually: annual,
				},
			})
			if (result.kind === 'error') throw new Error(result.reason)
		},
		onSuccess: () => {
			setTitle('')
			setMonth('1')
			setDay('1')
			setAnnual(true)
			setYear(String(new Date().getUTCFullYear()))
			setOpen(false)
			qc.invalidateQueries({ queryKey: customHolidaysQueryKey })
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to add holiday'),
	})

	const canSubmit =
		title.trim().length > 0 && Number.isFinite(Number(month)) && Number.isFinite(Number(day)) && (annual || Number.isFinite(Number(year)))

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Plus className="size-4 mr-1" /> Custom
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add custom holiday</DialogTitle>
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
							<Input id="custom-month" type="number" min={1} max={12} value={month} onChange={e => setMonth(e.target.value)} />
						</div>
						<div className="flex flex-col gap-1.5 flex-1">
							<Label htmlFor="custom-day">Day</Label>
							<Input id="custom-day" type="number" min={1} max={31} value={day} onChange={e => setDay(e.target.value)} />
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
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
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
