'use client'

import { HelpCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import UserAvatar from '@/components/common/user-avatar'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TapTooltip, TapTooltipContent, TapTooltipTrigger } from '@/components/ui/tooltip'
import type { AccessLevel } from '@/db/schema/enums'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

// Visible tier on the row's toggle: the four states the UI exposes. Maps onto
// (accessLevel, canEdit) pairs server-side.
export type AccessTier = 'none' | 'restricted' | 'view' | 'edit'

export type PermissionRow = {
	id: string
	email: string
	name: string | null
	image: string | null
	access: AccessTier
	sharedWithMe?: AccessTier
	cannotBeRestricted: boolean
	// True when the row's user is a guardian of the current user. Children
	// cannot change permissions toward their guardian, so the whole row is
	// locked (the server rejects the write regardless).
	isGuardian?: boolean
}

export function toTier(accessLevel: AccessLevel, canEdit: boolean): AccessTier {
	if (accessLevel === 'none') return 'none'
	if (accessLevel === 'restricted') return 'restricted'
	if (canEdit) return 'edit'
	return 'view'
}

export function fromTier(access: AccessTier): { accessLevel: AccessLevel; canEdit: boolean } {
	switch (access) {
		case 'none':
			return { accessLevel: 'none', canEdit: false }
		case 'restricted':
			return { accessLevel: 'restricted', canEdit: false }
		case 'view':
			return { accessLevel: 'view', canEdit: false }
		case 'edit':
			return { accessLevel: 'view', canEdit: true }
	}
}

type Props = {
	rows: Array<PermissionRow> | null
	isLoading: boolean
	isSaving: boolean
	// Optional when the editor is embedded — the parent saves on its own
	// submit and reads the current rows via onChange.
	onSave?: (rows: Array<PermissionRow>) => Promise<void>
	// When true, render the "they share with you" green-dot indicator next
	// to each name. The admin-acting-on-behalf surface omits this since the
	// actor isn't the owner.
	showShareIndicator?: boolean
	emptyLabel?: string
	// When true, the editor doesn't render its own Save button — the
	// parent owns submission and the editor just bubbles up state changes
	// via onChange. Used by the admin Edit User dialog so a single "Update
	// User" action saves everything (user info, guardianships, permissions).
	embedded?: boolean
	onChange?: (rows: Array<PermissionRow>) => void
	// When true, hide the "Edit" tier. Used for the viewer-direction editor
	// (what a user can see of OTHERS' lists), where granting yourself edit
	// access to someone else's list isn't a thing - the viewer upsert path
	// only ever writes accessLevel (none / restricted / view).
	hideEditTier?: boolean
	// User ids whose row should be locked regardless of the persisted
	// `isGuardian` flag. The admin Edit User dialog drives this from the live
	// guardian picker so checking/unchecking a guardian locks/unlocks that
	// person's toggles immediately, before the form is even saved.
	lockedUserIds?: ReadonlySet<string>
}

export function PermissionsEditor({
	rows: initialRows,
	isLoading,
	isSaving,
	onSave,
	showShareIndicator = true,
	emptyLabel,
	embedded = false,
	onChange,
	hideEditTier = false,
	lockedUserIds,
}: Props) {
	const [rows, setRows] = useState<Array<PermissionRow>>([])
	const [dirty, setDirty] = useState(false)

	const incomingKey = useMemo(
		() => (initialRows ? initialRows.map(r => `${r.id}:${r.access}:${r.sharedWithMe ?? ''}`).join('|') : null),
		[initialRows]
	)

	useEffect(() => {
		if (initialRows) {
			setRows(initialRows)
			setDirty(false)
		}
	}, [incomingKey, initialRows])

	const handleAccessChange = (userId: string, access: AccessTier) => {
		setRows(prev => {
			const next = prev.map(row => (row.id === userId ? { ...row, access } : row))
			onChange?.(next)
			return next
		})
		setDirty(true)
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!onSave) return
		try {
			await onSave(rows)
			setDirty(false)
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : m.settings_permissions_update_failed()
			toast.error(errorMessage)
		}
	}

	const hasRows = rows.length > 0

	if (isLoading && !hasRows) {
		return <LoadingSkeleton />
	}

	if (!hasRows) {
		return <div className="text-sm text-muted-foreground">{emptyLabel ?? m.settings_permissions_empty()}</div>
	}

	const table = (
		<div className="rounded-lg border overflow-x-auto">
			<div className="grid min-w-max grid-cols-[auto_auto] divide-y">
				<div className="contents text-xs font-medium uppercase tracking-wide text-muted-foreground bg-muted/30">
					<span className="px-4 py-2 bg-muted/30 flex items-center">{m.settings_permissions_column_person()}</span>
					<span className="px-4 py-2 bg-muted/30 flex items-center gap-1.5">
						{m.settings_permissions_column_access()}
						<AccessHelp />
					</span>
				</div>
				{rows.map(row => (
					<div key={row.id} className="contents">
						<div className="flex items-center gap-3 px-4 py-3">
							<UserAvatar name={row.name || row.email} image={row.image} size="medium" />
							<div className="font-medium whitespace-nowrap">{row.name || row.email}</div>
							{showShareIndicator && row.sharedWithMe ? <ShareIndicator sharedWithMe={row.sharedWithMe} /> : null}
						</div>
						<div className="flex items-center px-4 py-3">
							<ToggleGroup
								type="single"
								variant="outline"
								value={row.access}
								onValueChange={value => {
									if (value) handleAccessChange(row.id, value as AccessTier)
								}}
								disabled={isSaving || row.isGuardian || (lockedUserIds?.has(row.id) ?? false)}
								title={row.isGuardian || lockedUserIds?.has(row.id) ? m.settings_permissions_guardian_locked() : undefined}
							>
								<ToggleGroupItem
									value="none"
									aria-label={m.settings_permissions_tier_none_label()}
									className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
								>
									{m.settings_permissions_tier_none()}
								</ToggleGroupItem>
								<ToggleGroupItem
									value="restricted"
									aria-label={m.settings_permissions_tier_restricted_label()}
									disabled={row.cannotBeRestricted}
									title={row.cannotBeRestricted ? m.settings_permissions_cannot_restrict() : undefined}
									className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
								>
									{m.settings_permissions_tier_restrict()}
								</ToggleGroupItem>
								<ToggleGroupItem
									value="view"
									aria-label={m.settings_permissions_tier_view_label()}
									className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
								>
									{m.settings_permissions_tier_view()}
								</ToggleGroupItem>
								{!hideEditTier && (
									<ToggleGroupItem
										value="edit"
										aria-label={m.settings_permissions_tier_edit_label()}
										className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
									>
										{m.settings_permissions_tier_edit()}
									</ToggleGroupItem>
								)}
							</ToggleGroup>
						</div>
					</div>
				))}
			</div>
		</div>
	)

	if (embedded) {
		return (
			<div className="space-y-4">
				{table}
				{showShareIndicator ? <Legend /> : null}
			</div>
		)
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			{table}
			<div className="flex items-center justify-between gap-4">
				{showShareIndicator ? <Legend /> : <span />}
				<Button type="submit" disabled={isSaving || !dirty}>
					{isSaving ? m.settings_permissions_saving() : m.settings_permissions_save()}
				</Button>
			</div>
		</form>
	)
}

function ShareIndicator({ sharedWithMe }: { sharedWithMe: AccessTier }) {
	// Restricted is intentionally rendered the same as view here: the viewer
	// should not be able to tell whether someone has restricted them.
	const label =
		sharedWithMe === 'edit'
			? m.settings_permissions_shared_edit()
			: sharedWithMe === 'none'
				? m.settings_permissions_shared_none()
				: m.settings_permissions_shared_view()
	return (
		<TapTooltip>
			<TapTooltipTrigger asChild>
				<span
					aria-label={label}
					className={cn(
						'inline-block size-3 rounded-full shrink-0 transition-shadow',
						sharedWithMe === 'none' && 'border border-muted-foreground/40 bg-transparent',
						(sharedWithMe === 'view' || sharedWithMe === 'restricted') && 'bg-primary',
						sharedWithMe === 'edit' && 'animate-edit-pulse'
					)}
				/>
			</TapTooltipTrigger>
			<TapTooltipContent>{label}</TapTooltipContent>
		</TapTooltip>
	)
}

function AccessHelp() {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={m.settings_permissions_help_label()}
					className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<HelpCircle className="size-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-72 text-sm normal-case font-normal tracking-normal">
				<div className="space-y-3">
					<div>
						<div className="font-semibold text-foreground">{m.settings_permissions_tier_none()}</div>
						<p className="text-muted-foreground">{m.settings_permissions_help_none()}</p>
					</div>
					<div>
						<div className="font-semibold text-foreground">{m.settings_permissions_tier_restricted()}</div>
						<p className="text-muted-foreground">{m.settings_permissions_help_restricted()}</p>
					</div>
					<div>
						<div className="font-semibold text-foreground">{m.settings_permissions_tier_view()}</div>
						<p className="text-muted-foreground">{m.settings_permissions_help_view()}</p>
					</div>
					<div>
						<div className="font-semibold text-foreground">{m.settings_permissions_tier_edit()}</div>
						<p className="text-muted-foreground">{m.settings_permissions_help_edit()}</p>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

function Legend() {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
			<div className="flex items-center gap-1.5">
				<span className="inline-block size-3 rounded-full border border-muted-foreground/40" />
				{m.settings_permissions_legend_none()}
			</div>
			<div className="flex items-center gap-1.5">
				<span className="inline-block size-3 rounded-full bg-primary" />
				{m.settings_permissions_legend_view()}
			</div>
			<div className="flex items-center gap-1.5">
				<span className="inline-block size-3 rounded-full animate-edit-pulse" />
				{m.settings_permissions_legend_edit()}
			</div>
		</div>
	)
}
