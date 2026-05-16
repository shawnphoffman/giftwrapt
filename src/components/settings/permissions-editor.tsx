'use client'

import { HelpCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import UserAvatar from '@/components/common/user-avatar'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AccessLevel } from '@/db/schema/enums'
import { cn } from '@/lib/utils'

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
	onSave: (rows: Array<PermissionRow>) => Promise<void>
	// When true, render the "they share with you" green-dot indicator next
	// to each name. The admin-acting-on-behalf surface omits this since the
	// actor isn't the owner.
	showShareIndicator?: boolean
	emptyLabel?: string
}

export function PermissionsEditor({ rows: initialRows, isLoading, isSaving, onSave, showShareIndicator = true, emptyLabel }: Props) {
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
		setRows(prev => prev.map(row => (row.id === userId ? { ...row, access } : row)))
		setDirty(true)
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		try {
			await onSave(rows)
			setDirty(false)
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to update permissions'
			toast.error(errorMessage)
		}
	}

	const hasRows = rows.length > 0

	if (isLoading && !hasRows) {
		return <LoadingSkeleton />
	}

	if (!hasRows) {
		return <div className="text-sm text-muted-foreground">{emptyLabel ?? 'No other users found'}</div>
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="rounded-lg border overflow-x-auto">
				<div className="grid min-w-max grid-cols-[auto_auto] divide-y">
					<div className="contents text-xs font-medium uppercase tracking-wide text-muted-foreground bg-muted/30">
						<span className="px-4 py-2 bg-muted/30 flex items-center">Person</span>
						<span className="px-4 py-2 bg-muted/30 flex items-center gap-1.5">
							Access
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
									disabled={isSaving}
								>
									<ToggleGroupItem
										value="none"
										aria-label="No access"
										className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
									>
										None
									</ToggleGroupItem>
									<ToggleGroupItem
										value="restricted"
										aria-label="Restricted access"
										disabled={row.cannotBeRestricted}
										title={row.cannotBeRestricted ? 'Partners and guardians cannot be set to restricted' : undefined}
										className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
									>
										Restrict
									</ToggleGroupItem>
									<ToggleGroupItem
										value="view"
										aria-label="View access"
										className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
									>
										View
									</ToggleGroupItem>
									<ToggleGroupItem
										value="edit"
										aria-label="Edit access"
										className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
									>
										Edit
									</ToggleGroupItem>
								</ToggleGroup>
							</div>
						</div>
					))}
				</div>
			</div>

			<div className="flex items-center justify-between gap-4">
				{showShareIndicator ? <Legend /> : <span />}
				<Button type="submit" disabled={isSaving || !dirty}>
					{isSaving ? 'Saving...' : 'Save Permissions'}
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
			? "They've given you edit access to their lists"
			: sharedWithMe === 'none'
				? "They haven't shared their lists with you"
				: 'They share their lists with you'
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					aria-label={label}
					className={cn(
						'inline-block size-3 rounded-full shrink-0 transition-shadow',
						sharedWithMe === 'none' && 'border border-muted-foreground/40 bg-transparent',
						(sharedWithMe === 'view' || sharedWithMe === 'restricted') && 'bg-primary',
						sharedWithMe === 'edit' && 'animate-edit-pulse'
					)}
				/>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

function AccessHelp() {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="What do these access levels mean?"
					className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<HelpCircle className="size-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-72 text-sm normal-case font-normal tracking-normal">
				<div className="space-y-3">
					<div>
						<div className="font-semibold text-foreground">None</div>
						<p className="text-muted-foreground">They can't see your lists or any items on them.</p>
					</div>
					<div>
						<div className="font-semibold text-foreground">Restricted</div>
						<p className="text-muted-foreground">
							They can view your lists and claim gifts for you, but they cannot see things that other people have purchased.
						</p>
					</div>
					<div>
						<div className="font-semibold text-foreground">View</div>
						<p className="text-muted-foreground">They can see your public lists and the items on them, and claim items as gifts.</p>
					</div>
					<div>
						<div className="font-semibold text-foreground">Edit</div>
						<p className="text-muted-foreground">Everything View allows, plus they can create and edit lists and items on your behalf.</p>
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
				They haven't shared
			</div>
			<div className="flex items-center gap-1.5">
				<span className="inline-block size-3 rounded-full bg-primary" />
				They share with you
			</div>
			<div className="flex items-center gap-1.5">
				<span className="inline-block size-3 rounded-full animate-edit-pulse" />
				They let you edit
			</div>
		</div>
	)
}
