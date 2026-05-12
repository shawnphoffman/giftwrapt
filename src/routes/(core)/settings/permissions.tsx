'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { HelpCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { getOwnersWithRelationshipsForMe, getUsersWithRelationships, upsertUserRelationships } from '@/api/permissions'
import UserAvatar from '@/components/common/user-avatar'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AccessLevel } from '@/db/schema/enums'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(core)/settings/permissions')({
	component: PermissionsPage,
})

// Visible tier on the row's toggle: the four states the UI exposes. Maps onto
// (accessLevel, canEdit) pairs server-side.
type AccessTier = 'none' | 'restricted' | 'view' | 'edit'

type PermissionRow = {
	id: string
	email: string
	name: string | null
	image: string | null
	access: AccessTier
	sharedWithMe: AccessTier
	cannotBeRestricted: boolean
}

function toTier(accessLevel: AccessLevel, canEdit: boolean): AccessTier {
	if (accessLevel === 'none') return 'none'
	if (accessLevel === 'restricted') return 'restricted'
	if (canEdit) return 'edit'
	return 'view'
}

function fromTier(access: AccessTier): { accessLevel: AccessLevel; canEdit: boolean } {
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

function PermissionsPage() {
	const queryClient = useQueryClient()
	const [isSaving, setIsSaving] = useState(false)

	// `refetchOnMount: 'always'` is load-bearing for the `cannotBeRestricted`
	// flag: partner / guardianship changes elsewhere in the app must be
	// reflected here without forcing a hard refresh, but the long staleTime
	// keeps the data fresh between mounts.
	const { data: users, isLoading: isLoadingUsers } = useQuery({
		queryKey: ['permissions', 'users'],
		queryFn: () => getUsersWithRelationships(),
		staleTime: 10 * 60 * 1000,
		refetchOnMount: 'always',
	})

	const { data: owners, isLoading: isLoadingOwners } = useQuery({
		queryKey: ['permissions', 'owners'],
		queryFn: () => getOwnersWithRelationshipsForMe(),
		staleTime: 10 * 60 * 1000,
		refetchOnMount: 'always',
	})

	const initialRows = useMemo<Array<PermissionRow> | null>(() => {
		if (!users || !owners) return null
		const sharedMap = new Map(owners.map(o => [o.id, toTier(o.accessLevel, o.canEdit)]))
		return users.map(user => ({
			id: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			access: toTier(user.accessLevel, user.canEdit),
			sharedWithMe: sharedMap.get(user.id) ?? 'view',
			cannotBeRestricted: user.cannotBeRestricted,
		}))
	}, [users, owners])

	const [rows, setRows] = useState<Array<PermissionRow>>([])
	const [dirty, setDirty] = useState(false)

	useEffect(() => {
		if (initialRows) {
			setRows(initialRows)
			setDirty(false)
		}
	}, [initialRows])

	const handleAccessChange = (userId: string, access: AccessTier) => {
		setRows(prev => prev.map(row => (row.id === userId ? { ...row, access } : row)))
		setDirty(true)
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSaving(true)

		try {
			const relationships = rows.map(row => ({
				viewerUserId: row.id,
				...fromTier(row.access),
			}))

			const result = await upsertUserRelationships({ data: { relationships } })
			if (!result.success) {
				toast.error('Some users cannot be set to restricted (partner or guardian relationships are always full view).')
				setIsSaving(false)
				return
			}

			toast.success('Permissions updated')
			queryClient.invalidateQueries({ queryKey: ['permissions', 'users'] })
			setDirty(false)
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to update permissions'
			toast.error(errorMessage)
		} finally {
			setIsSaving(false)
		}
	}

	const isLoading = isLoadingUsers || isLoadingOwners || initialRows === null
	const hasRows = rows.length > 0

	return (
		<Card className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Permissions</CardTitle>
				<CardDescription>
					Choose what each person can do with your wish lists. A green dot next to their name means they've shared their lists with you too.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading && !hasRows ? (
					<LoadingSkeleton />
				) : !hasRows ? (
					<div className="text-sm text-muted-foreground">No other users found</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-6">
						<div className="rounded-lg border overflow-x-auto">
							{/* Two-column grid: Person column auto-sizes to the longest
							    name; Access column is sized to its content (the toggle
							    group). The grid lives on a single inner element so all
							    rows align column-for-column with the header. */}
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
											<ShareIndicator sharedWithMe={row.sharedWithMe} />
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
							<Legend />
							<Button type="submit" disabled={isSaving || !dirty}>
								{isSaving ? 'Saving...' : 'Save'}
							</Button>
						</div>
					</form>
				)}
			</CardContent>
		</Card>
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
