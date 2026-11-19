import { useQuery } from '@tanstack/react-query'

import { getPermissionsMatrixAsAdmin } from '@/api/admin'
import { PermissionsMatrixView } from '@/components/admin/permissions-matrix-view'
import { Skeleton } from '@/components/ui/skeleton'
import { m } from '@/paraglide/messages.js'

export function PermissionsMatrix() {
	const { data, isLoading, error } = useQuery({
		queryKey: ['admin', 'permissions-matrix'],
		queryFn: () => getPermissionsMatrixAsAdmin(),
		staleTime: 5 * 60 * 1000,
	})

	if (isLoading) return <Skeleton className="h-64 w-full" />
	if (error) {
		return (
			<div className="text-sm text-destructive">
				{m.admin_perms_matrix_load_error({ error: error instanceof Error ? error.message : m.admin_users_unknown_error() })}
			</div>
		)
	}
	if (!data) return null

	return <PermissionsMatrixView data={data} />
}
