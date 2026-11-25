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
import { Plus, Trash2, Users } from 'lucide-react'
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
import { RichMessage } from '@/components/common/rich-message'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppSetting } from '@/hooks/use-app-settings'
import { SUPPORTED_COUNTRIES } from '@/lib/holidays-countries'
import { formatDate } from '@/lib/i18n/format'
import { monthName } from '@/lib/i18n/labels'
import { m } from '@/paraglide/messages.js'

const MONTHS: ReadonlyArray<{ value: string; days: number }> = [
	{ value: '1', days: 31 },
	{ value: '2', days: 29 },
	{ value: '3', days: 31 },
	{ value: '4', days: 30 },
	{ value: '5', days: 31 },
	{ value: '6', days: 30 },
	{ value: '7', days: 31 },
	{ value: '8', days: 31 },
	{ value: '9', days: 30 },
	{ value: '10', days: 31 },
	{ value: '11', days: 30 },
	{ value: '12', days: 31 },
]

const customHolidaysQueryKey = ['admin-custom-holidays'] as const
const recipientCandidatesQueryKey = ['admin-custom-holidays-recipients'] as const

function nextOccurrenceText(iso: string | null): string {
	if (!iso) return m.admin_settings_holidays_next_none()
	return m.admin_settings_holidays_next_date({ date: formatDate(iso, { month: 'short', day: 'numeric', year: 'numeric' }) })
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
			<SelectTrigger id={id} className="w-full flex-1">
				<SelectValue placeholder={m.admin_settings_holidays_recipient_everyone()} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="none">
					<span className="flex size-6 items-center justify-center rounded-full bg-muted-foreground">
						<Users className="size-3.5 text-background" />
					</span>
					<span className="truncate">{m.admin_settings_holidays_recipient_everyone()}</span>
				</SelectItem>
				{users.length > 0 && (
					<>
						<div className="px-2 pt-2 text-xs font-medium text-muted-foreground">{m.admin_settings_holidays_recipient_users()}</div>
						{users.map(u => (
							<SelectItem key={`u:${u.id}`} value={`u:${u.id}`}>
								<UserAvatar name={u.name} image={u.image} size="small" />
								<span className="truncate">{u.name}</span>
							</SelectItem>
						))}
					</>
				)}
				{dependents.length > 0 && (
					<>
						<div className="px-2 pt-2 text-xs font-medium text-muted-foreground">{m.admin_settings_holidays_recipient_dependents()}</div>
						{dependents.map(d => (
							<SelectItem key={`d:${d.id}`} value={`d:${d.id}`}>
								<DependentAvatar name={d.name} image={d.image} size="small" />
								<span className="truncate">{d.name}</span>
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
				<span>{m.admin_settings_holidays_recipient_for({ name: row.recipientUserName })}</span>
			</span>
		)
	}
	if (row.recipientDependentId && row.recipientDependentName) {
		return (
			<span className="inline-flex items-center gap-1">
				<DependentAvatar name={row.recipientDependentName} image={null} size="small" />
				<span>{m.admin_settings_holidays_recipient_for({ name: row.recipientDependentName })}</span>
			</span>
		)
	}
	return <span className="text-muted-foreground">{m.admin_settings_holidays_recipient_everyone()}</span>
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
				<RichMessage
					parts={m.admin_settings_holidays_disabled.parts()}
					tags={{ strong: children => <span className="font-medium">{children}</span> }}
				/>
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
				<div className="text-sm text-muted-foreground">{m.admin_settings_holidays_loading()}</div>
			) : rows.length === 0 ? (
				<div className="text-sm text-muted-foreground">{m.admin_settings_holidays_empty()}</div>
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
		onError: err => toast.error(err instanceof Error ? err.message : m.admin_settings_holidays_update_failed()),
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
		onError: err => toast.error(err instanceof Error ? err.message : m.admin_settings_holidays_recipient_update_failed()),
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
				toast.success(m.admin_settings_holidays_deleted_converted({ count: result.convertedListCount }))
			} else {
				toast.success(m.admin_settings_holidays_deleted())
			}
		},
		onError: err => toast.error(err instanceof Error ? err.message : m.admin_settings_holidays_delete_failed()),
	})

	const sourceLabel =
		row.source === 'catalog'
			? m.admin_settings_holidays_source_catalog({ country: row.catalogCountry ?? '' })
			: m.admin_settings_holidays_source_custom()

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
						<Input
							value={title}
							onChange={e => setTitle(e.target.value)}
							autoFocus
							className="h-8"
							autoComplete="off"
							data-1p-ignore
							data-lpignore="true"
						/>
						<Button type="submit" size="sm" disabled={updateTitle.isPending}>
							{m.action_save()}
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
							{m.action_cancel()}
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
					{[
						sourceLabel,
						nextOccurrenceText(row.nextOccurrenceIso),
						row.usageCount > 0 ? m.admin_settings_holidays_used_by({ count: row.usageCount }) : null,
					]
						.filter(part => part !== null)
						.join(' · ')}
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
								{m.action_cancel()}
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
					<Button variant="outline" size="xs" aria-label={m.action_delete()}>
						<Trash2 className="size-4" />
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{m.admin_settings_holidays_delete_title({ title: row.title })}</AlertDialogTitle>
						<AlertDialogDescription>
							{row.usageCount > 0
								? m.admin_settings_holidays_delete_referenced({ count: row.usageCount })
								: m.admin_settings_holidays_delete_unreferenced()}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{m.action_cancel()}</AlertDialogCancel>
						<AlertDialogAction onClick={() => remove.mutate()}>{m.action_delete()}</AlertDialogAction>
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
		onError: err => toast.error(err instanceof Error ? err.message : m.admin_settings_holidays_add_failed()),
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
					<Plus className="size-4 mr-1" /> {m.admin_settings_holidays_add_catalog_button()}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.admin_settings_holidays_catalog_dialog_title()}</DialogTitle>
					<DialogDescription>{m.admin_settings_holidays_catalog_dialog_description()}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="catalog-recipient">{m.admin_settings_holidays_recipient_label()}</Label>
					<RecipientPicker
						id="catalog-recipient"
						value={recipient}
						onChange={setRecipient}
						candidates={recipientCandidatesQuery.data ?? []}
						disabled={add.isPending}
					/>
					<p className="text-xs text-muted-foreground">{m.admin_settings_holidays_recipient_help()}</p>
				</div>
				<div className="flex flex-col gap-3">
					{candidatesQuery.isLoading ? (
						<p className="text-sm text-muted-foreground">{m.admin_settings_holidays_loading()}</p>
					) : candidates.length === 0 ? (
						<p className="text-sm text-muted-foreground">{m.admin_settings_holidays_catalog_empty()}</p>
					) : (
						<ul className="flex flex-col gap-1 max-h-96 overflow-auto">
							{candidates.map(c => (
								<li key={`${c.country}:${c.key}`} className="flex items-center justify-between gap-2 rounded border border-border p-2">
									<span className="flex min-w-0 items-center gap-2">
										<Badge variant="outline" className="w-9 font-mono text-muted-foreground">
											{c.country}
										</Badge>
										<span className="truncate">{c.name}</span>
									</span>
									<Button size="sm" onClick={() => add.mutate({ country: c.country, key: c.key })} disabled={add.isPending}>
										{m.action_add()}
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{m.action_close()}
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

	const selectedMonth = MONTHS.find(entry => entry.value === month)
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
		onError: err => toast.error(err instanceof Error ? err.message : m.admin_settings_holidays_add_failed()),
	})

	const canSubmit = title.trim().length > 0 && month !== '' && day !== '' && (annual || Number.isFinite(Number(year)))

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Plus className="size-4 mr-1" /> {m.admin_settings_holidays_add_custom_button()}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.admin_settings_holidays_custom_dialog_title()}</DialogTitle>
					<DialogDescription>{m.admin_settings_holidays_custom_dialog_description()}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="custom-title">{m.admin_settings_holidays_custom_title_label()}</Label>
						<Input
							id="custom-title"
							value={title}
							onChange={e => setTitle(e.target.value)}
							maxLength={120}
							autoFocus
							autoComplete="off"
							data-1p-ignore
							data-lpignore="true"
						/>
					</div>
					<div className="flex gap-2">
						<div className="flex flex-col gap-1.5 flex-1">
							<Label htmlFor="custom-month">{m.admin_settings_holidays_custom_month_label()}</Label>
							<Select
								value={month}
								onValueChange={value => {
									setMonth(value)
									setDay('')
								}}
							>
								<SelectTrigger id="custom-month">
									<SelectValue placeholder={m.admin_settings_holidays_custom_month_placeholder()} />
								</SelectTrigger>
								<SelectContent>
									{MONTHS.map(entry => (
										<SelectItem key={entry.value} value={entry.value}>
											{monthName(Number(entry.value))}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5 flex-1">
							<Label htmlFor="custom-day">{m.admin_settings_holidays_custom_day_label()}</Label>
							<Select value={day} onValueChange={setDay} disabled={!selectedMonth}>
								<SelectTrigger id="custom-day">
									<SelectValue
										placeholder={
											selectedMonth
												? m.admin_settings_holidays_custom_day_placeholder()
												: m.admin_settings_holidays_custom_day_placeholder_no_month()
										}
									/>
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
						<span className="text-sm">{m.admin_settings_holidays_custom_repeats_label()}</span>
					</label>
					{!annual && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="custom-year">{m.admin_settings_holidays_custom_year_label()}</Label>
							<Input id="custom-year" type="number" min={1900} max={3000} value={year} onChange={e => setYear(e.target.value)} />
						</div>
					)}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="custom-recipient">{m.admin_settings_holidays_recipient_label()}</Label>
						<RecipientPicker
							id="custom-recipient"
							value={recipient}
							onChange={setRecipient}
							candidates={recipientCandidatesQuery.data ?? []}
							disabled={add.isPending}
						/>
						<p className="text-xs text-muted-foreground">{m.admin_settings_holidays_recipient_help()}</p>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{m.action_cancel()}
					</Button>
					<Button onClick={() => add.mutate()} disabled={!canSubmit || add.isPending}>
						{m.action_add()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
