// Admin UI for the per-deploy holiday catalog. Lets the operator pick
// a country, see what's enabled (and how many lists reference each
// entry), toggle entries on or off, rename them, delete unused ones,
// or browse the full date-holidays library to add brand-new entries.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
	addCatalogEntryAsAdmin,
	type AdminCatalogEntry,
	deleteCatalogEntryAsAdmin,
	getAdminSupportedCountries,
	type LibraryCandidate,
	listCatalogEntriesAsAdmin,
	listLibraryCandidatesAsAdmin,
	updateCatalogEntryAsAdmin,
} from '@/api/holiday-catalog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const catalogQueryKey = (country: string) => ['admin-holiday-catalog', country] as const
const candidatesQueryKey = (country: string) => ['admin-holiday-candidates', country] as const

function formatDate(iso: string | null): string {
	if (!iso) return '—'
	try {
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
	} catch {
		return iso
	}
}

export function HolidayCatalogSection() {
	const queryClient = useQueryClient()

	const countriesQuery = useQuery({
		queryKey: ['admin-holiday-supported-countries'],
		queryFn: () => getAdminSupportedCountries(),
		staleTime: 60 * 60 * 1000,
	})
	const countries = countriesQuery.data ?? []

	const [country, setCountry] = useState<string>('')
	const activeCountry = country || countries[0]?.code || ''

	const catalogQuery = useQuery({
		queryKey: catalogQueryKey(activeCountry),
		queryFn: () => listCatalogEntriesAsAdmin({ data: { country: activeCountry } }),
		enabled: !!activeCountry,
		staleTime: 30 * 1000,
	})

	const updateMutation = useMutation({
		mutationFn: (input: { id: string; name?: string; isEnabled?: boolean }) => updateCatalogEntryAsAdmin({ data: input }),
		onSuccess: result => {
			if (result.kind === 'error') {
				toast.error(result.reason === 'invalid-name' ? 'Name cannot be empty.' : 'Catalog entry not found.')
				return
			}
			queryClient.invalidateQueries({ queryKey: catalogQueryKey(activeCountry) })
		},
		onError: () => toast.error('Failed to update entry.'),
	})

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteCatalogEntryAsAdmin({ data: { id } }),
		onSuccess: result => {
			if (result.kind === 'error') {
				if (result.reason === 'in-use') {
					toast.error(
						`Can't delete: ${result.usageCount} list${result.usageCount === 1 ? '' : 's'} still reference this holiday. Disable it instead.`
					)
				} else {
					toast.error('Catalog entry not found.')
				}
				return
			}
			toast.success('Holiday removed from catalog.')
			queryClient.invalidateQueries({ queryKey: catalogQueryKey(activeCountry) })
			queryClient.invalidateQueries({ queryKey: candidatesQueryKey(activeCountry) })
		},
		onError: () => toast.error('Failed to delete entry.'),
	})

	const [addOpen, setAddOpen] = useState(false)

	if (countriesQuery.isLoading) {
		return <div className="text-sm text-muted-foreground">Loading countries…</div>
	}

	if (countries.length === 0) {
		return <div className="text-sm text-muted-foreground">No supported countries available.</div>
	}

	return (
		<div className="space-y-6">
			<div className="flex items-end justify-between gap-4">
				<div className="space-y-1">
					<Label htmlFor="catalog-country">Country</Label>
					<Select value={activeCountry} onValueChange={setCountry}>
						<SelectTrigger id="catalog-country" className="w-[220px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{countries.map(c => (
								<SelectItem key={c.code} value={c.code}>
									{c.name} ({c.code})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button type="button" variant="outline" onClick={() => setAddOpen(true)} disabled={!activeCountry}>
					<Plus className="size-4" /> Add holiday
				</Button>
			</div>

			{catalogQuery.isLoading ? (
				<div className="text-sm text-muted-foreground">Loading catalog…</div>
			) : (catalogQuery.data ?? []).length === 0 ? (
				<Alert>
					<AlertTitle>No holidays configured</AlertTitle>
					<AlertDescription>
						Users won't see {countries.find(c => c.code === activeCountry)?.name ?? activeCountry} in the country dropdown until at least
						one holiday is added below.
					</AlertDescription>
				</Alert>
			) : (
				<ul className="divide-y rounded-md border">
					{(catalogQuery.data ?? []).map(entry => (
						<CatalogEntryRow
							key={entry.id}
							entry={entry}
							onRename={name => updateMutation.mutate({ id: entry.id, name })}
							onToggle={isEnabled => updateMutation.mutate({ id: entry.id, isEnabled })}
							onDelete={() => deleteMutation.mutate(entry.id)}
							busy={updateMutation.isPending || deleteMutation.isPending}
						/>
					))}
				</ul>
			)}

			<AddHolidayDialog
				open={addOpen}
				onOpenChange={setAddOpen}
				country={activeCountry}
				onAdded={() => {
					queryClient.invalidateQueries({ queryKey: catalogQueryKey(activeCountry) })
					queryClient.invalidateQueries({ queryKey: candidatesQueryKey(activeCountry) })
				}}
			/>
		</div>
	)
}

type CatalogRowProps = {
	entry: AdminCatalogEntry
	onRename: (name: string) => void
	onToggle: (isEnabled: boolean) => void
	onDelete: () => void
	busy: boolean
}

function CatalogEntryRow({ entry, onRename, onToggle, onDelete, busy }: CatalogRowProps) {
	const [draftName, setDraftName] = useState(entry.name)
	const [editing, setEditing] = useState(false)

	const commitRename = () => {
		const trimmed = draftName.trim()
		if (!trimmed || trimmed === entry.name) {
			setDraftName(entry.name)
			setEditing(false)
			return
		}
		onRename(trimmed)
		setEditing(false)
	}

	return (
		<li className="flex items-center justify-between gap-4 p-3">
			<div className="min-w-0 flex-1 space-y-0.5">
				{editing ? (
					<Input
						value={draftName}
						onChange={e => setDraftName(e.target.value)}
						onBlur={commitRename}
						onKeyDown={e => {
							if (e.key === 'Enter') e.currentTarget.blur()
							if (e.key === 'Escape') {
								setDraftName(entry.name)
								setEditing(false)
							}
						}}
						autoFocus
						className="h-8 max-w-xs"
					/>
				) : (
					<button type="button" className="text-left font-medium hover:underline" onClick={() => setEditing(true)}>
						{entry.name}
					</button>
				)}
				<p className="text-xs text-muted-foreground">
					<code>{entry.slug}</code> • next: {formatDate(entry.nextOccurrence)} • used by {entry.usageCount}{' '}
					{entry.usageCount === 1 ? 'list' : 'lists'}
				</p>
			</div>
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-2">
					<Switch id={`enabled-${entry.id}`} checked={entry.isEnabled} disabled={busy} onCheckedChange={v => onToggle(v === true)} />
					<Label htmlFor={`enabled-${entry.id}`} className="text-xs text-muted-foreground">
						{entry.isEnabled ? 'Enabled' : 'Disabled'}
					</Label>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy || entry.usageCount > 0}
					onClick={onDelete}
					title={entry.usageCount > 0 ? 'Disable instead — lists still reference this holiday' : 'Delete from catalog'}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
		</li>
	)
}

type AddDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	country: string
	onAdded: () => void
}

function AddHolidayDialog({ open, onOpenChange, country, onAdded }: AddDialogProps) {
	const candidatesQuery = useQuery({
		queryKey: candidatesQueryKey(country),
		queryFn: () => listLibraryCandidatesAsAdmin({ data: { country } }),
		enabled: open && !!country,
		staleTime: 60 * 1000,
	})

	const [filter, setFilter] = useState('')
	const [pending, setPending] = useState<string | null>(null)

	const filtered = useMemo(() => {
		const all = candidatesQuery.data ?? []
		const q = filter.trim().toLowerCase()
		if (!q) return all
		return all.filter(c => c.name.toLowerCase().includes(q))
	}, [candidatesQuery.data, filter])

	const addMutation = useMutation({
		mutationFn: (cand: LibraryCandidate) => addCatalogEntryAsAdmin({ data: { country, rule: cand.rule, name: cand.name } }),
		onMutate: cand => setPending(cand.rule),
		onSettled: () => setPending(null),
		onSuccess: result => {
			if (result.kind === 'error') {
				const msg: Record<typeof result.reason, string> = {
					'invalid-country': 'Country is not supported by the library.',
					'invalid-rule': "That rule didn't resolve to any holiday.",
					'duplicate-slug': 'A catalog entry with that slug already exists.',
					'invalid-name': 'Name is invalid.',
				}
				toast.error(msg[result.reason])
				return
			}
			toast.success('Holiday added to catalog.')
			onAdded()
		},
		onError: () => toast.error('Failed to add holiday.'),
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add a holiday</DialogTitle>
					<DialogDescription>
						Pick from the bundled date-holidays catalog. The display name and slug can be edited after the entry is added.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<Input placeholder="Filter by name…" value={filter} onChange={e => setFilter(e.target.value)} />
					{candidatesQuery.isLoading ? (
						<div className="text-sm text-muted-foreground">Loading candidates…</div>
					) : filtered.length === 0 ? (
						<div className="text-sm text-muted-foreground">No remaining candidates. All library entries are already in the catalog.</div>
					) : (
						<ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
							{filtered.map(c => (
								<li key={c.rule} className="flex items-center justify-between gap-3 p-2">
									<div className="min-w-0">
										<div className="truncate text-sm font-medium">{c.name}</div>
										<div className="text-xs text-muted-foreground">
											{c.type} • next: {formatDate(c.nextDate)}
										</div>
									</div>
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={addMutation.isPending && pending === c.rule}
										onClick={() => addMutation.mutate(c)}
									>
										{addMutation.isPending && pending === c.rule ? (
											'Adding…'
										) : (
											<>
												<Check className="size-4" /> Add
											</>
										)}
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Done
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
