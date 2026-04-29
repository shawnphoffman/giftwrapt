import { useQuery } from '@tanstack/react-query'

import { getPermissionsMatrixAsAdmin } from '@/api/admin'
import { PermissionsMatrixView } from '@/components/admin/permissions-matrix-view'
import { Skeleton } from '@/components/ui/skeleton'

export function PermissionsMatrix() {
	const { data, isLoading, error } = useQuery({
		queryKey: ['admin', 'permissions-matrix'],
		queryFn: () => getPermissionsMatrixAsAdmin(),
		staleTime: 5 * 60 * 1000,
	})

	if (isLoading) return <Skeleton className="h-64 w-full" />
	if (error) {
		return <div className="text-sm text-destructive">Error loading matrix: {error instanceof Error ? error.message : 'Unknown error'}</div>
	}
	if (!data) return null

	return <PermissionsMatrixView data={data} />
}
