import { getUserDetailsAsAdmin } from '@/api/admin'

import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'

const userDetailsQueryOptions = (userId: string) => ({
	queryKey: ['admin', 'user', userId],
	queryFn: async () => {
		// TanStack Start's inputValidator wraps the input in 'data' property
		return await getUserDetailsAsAdmin({ data: { userId } })
	},
})

export default function UserDetails({ id }: { id: string }) {
	const { data: user, isLoading, error } = useQuery(userDetailsQueryOptions(id))

	if (isLoading) {
		return <LoadingSkeleton />
	}

	if (error) {
		return <div className="text-sm text-destructive">Error loading user: {error instanceof Error ? error.message : 'Unknown error'}</div>
	}

	if (!user) {
		return <div className="text-sm text-muted-foreground">User not found</div>
	}

	return (
		<div className="space-y-4">
			<div>
				<div className="text-sm font-medium text-muted-foreground">ID</div>
				<div className="text-sm">{user.id}</div>
			</div>
			<div>
				<div className="text-sm font-medium text-muted-foreground">Email</div>
				<div className="text-sm">{user.email}</div>
			</div>
			<div>
				<div className="text-sm font-medium text-muted-foreground">Name</div>
				<div className="text-sm">{user.name || 'No name'}</div>
			</div>
			<div>
				<div className="text-sm font-medium text-muted-foreground">Role</div>
				<div className="text-sm capitalize">{user.role}</div>
			</div>
			<div>
				<div className="text-sm font-medium text-muted-foreground">Admin</div>
				<div className="text-sm">{user.isAdmin ? 'Yes' : 'No'}</div>
			</div>
		</div>
	)
}
