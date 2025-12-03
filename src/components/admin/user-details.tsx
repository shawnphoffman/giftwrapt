import { getUserDetailsAsAdmin } from '@/api/admin'

import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import UserAvatar from '../common/user-avatar'
import { Separator } from '@radix-ui/react-separator'

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
		<div className="flex flex-col divide-y gap-2">
			{user.image && <UserAvatar name={user.name || user.email} image={user.image} className="w-16 h-16 rounded-full" />}
			<div className="space-y-2 pb-2">
				{Object.entries(user).map(([key, value]) => {
					if (key === 'image' || value === null) return null
					return (
						<div key={key}>
							<div className="text-sm font-bold text-muted-foreground">{key}</div>
							<div className="text-sm">{typeof value === 'string' ? value : JSON.stringify(value)}</div>
						</div>
					)
				})}
			</div>
			<div>
				<div className="text-sm font-bold text-muted-foreground">Admin</div>
				<div className="text-sm">{user.isAdmin ? 'Yes' : 'No'}</div>
			</div>
		</div>
	)
}
