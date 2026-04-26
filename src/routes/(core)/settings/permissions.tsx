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
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(core)/settings/permissions')({
	component: PermissionsPage,
})

type AccessLevel = 'none' | 'view' | 'edit'

type PermissionRow = {
	id: string
	email: string
	name: string | null
	image: string | null
	access: AccessLevel
	sharedWithMe: AccessLevel
}

function toAccessLevel(canView: boolean, canEdit: boolean): AccessLevel {
	if (canEdit) return 'edit'
	if (canView) return 'view'
	return 'none'
}

function fromAccessLevel(access: AccessLevel): { canView: boolean; canEdit: boolean } {
	return {
		canView: access !== 'none',
		canEdit: access === 'edit',
	}
}

function PermissionsPage() {
	const queryClient = useQueryClient()
	const [isSaving, setIsSaving] = useState(false)

	const { data: users, isLoading: isLoadingUsers } = useQuery({
		queryKey: ['permissions', 'users'],
		queryFn: () => getUsersWithRelationships(),
		staleTime: 10 * 60 * 1000,
	})

	const { data: owners, isLoading: isLoadingOwners } = useQuery({
		queryKey: ['permissions', 'owners'],
		queryFn: () => getOwnersWithRelationshipsForMe(),
		staleTime: 10 * 60 * 1000,
	})

	const initialRows = useMemo<Array<PermissionRow> | null>(() => {
		if (!users || !owners) return null
		const sharedMap = new Map(owners.map(o => [o.id, toAccessLevel(o.canView, o.canEdit)]))
		return users.map(user => ({
			id: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			access: toAccessLevel(user.canView, user.canEdit),
			sharedWithMe: sharedMap.get(user.id) ?? 'none',
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

	const handleAccessChange = (userId: string, access: AccessLevel) => {
		setRows(prev => prev.map(row => (row.id === userId ? { ...row, access } : row)))
		setDirty(true)
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSaving(true)

		try {
			const relationships = rows.map(row => ({
				viewerUserId: row.id,
				...fromAccessLevel(row.access),
			}))

			await upsertUserRelationships({ data: { relationships } })

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
		<div className="animate-page-in gap-6 flex flex-col">
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
						<div className="rounded-lg border divide-y">
							<div className="flex items-center justify-between gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground bg-muted/30">
								<span>Person</span>
								<div className="flex items-center gap-1.5">
									<span>Access</span>
									<AccessHelp />
								</div>
							</div>
							{rows.map(row => (
								<div key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
									<div className="flex items-center gap-3 min-w-0">
										<UserAvatar name={row.name || row.email} image={row.image} size="medium" />
										<div className="font-medium truncate">{row.name || row.email}</div>
										<ShareIndicator sharedWithMe={row.sharedWithMe} />
									</div>
									<ToggleGroup
										type="single"
										variant="outline"
										value={row.access}
										onValueChange={value => {
											if (value) handleAccessChange(row.id, value as AccessLevel)
										}}
										disabled={isSaving}
										className="shrink-0"
									>
										<ToggleGroupItem
											value="none"
											aria-label="No access"
											className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
										>
											None
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
							))}
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
		</div>
	)
}

function ShareIndicator({ sharedWithMe }: { sharedWithMe: AccessLevel }) {
	const label =
		sharedWithMe === 'edit'
			? "They've given you edit access to their lists"
			: sharedWithMe === 'view'
				? 'They share their lists with you'
				: "They haven't shared their lists with you"
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					aria-label={label}
					className={cn(
						'inline-block size-3 rounded-full shrink-0 transition-shadow',
						sharedWithMe === 'none' && 'border border-muted-foreground/40 bg-transparent',
						sharedWithMe === 'view' && 'bg-primary',
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
