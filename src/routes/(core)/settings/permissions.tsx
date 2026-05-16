'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { getOwnersWithRelationshipsForMe, getUsersWithRelationships, upsertUserRelationships } from '@/api/permissions'
import { fromTier, type PermissionRow, PermissionsEditor, toTier } from '@/components/settings/permissions-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/settings/permissions')({
	component: PermissionsPage,
})

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

	const handleSave = async (rows: Array<PermissionRow>) => {
		setIsSaving(true)
		try {
			const relationships = rows.map(row => ({
				viewerUserId: row.id,
				...fromTier(row.access),
			}))

			const result = await upsertUserRelationships({ data: { relationships } })
			if (!result.success) {
				toast.error('Some users cannot be set to restricted (partner or guardian relationships are always full view).')
				return
			}

			toast.success('Permissions updated')
			queryClient.invalidateQueries({ queryKey: ['permissions', 'users'] })
		} finally {
			setIsSaving(false)
		}
	}

	const isLoading = isLoadingUsers || isLoadingOwners || initialRows === null

	return (
		<Card className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Permissions</CardTitle>
				<CardDescription>
					Choose what each person can do with your wish lists. A green dot next to their name means they've shared their lists with you too.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<PermissionsEditor rows={initialRows} isLoading={isLoading} isSaving={isSaving} onSave={handleSave} showShareIndicator />
			</CardContent>
		</Card>
	)
}
