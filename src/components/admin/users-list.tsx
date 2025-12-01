import { useQuery } from '@tanstack/react-query'
import UserAvatar from '@/components/common/user-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import type { User } from '@/db-collections/users'
import UserBadge from '../common/user-badge'

export function UsersList() {
	const {
		data: users = [],
		isLoading,
		error,
	} = useQuery<User[]>({
		queryKey: ['admin', 'users'],
		queryFn: async () => {
			const response = await fetch('/api/admin/users')
			if (!response.ok) {
				throw new Error('Failed to fetch users')
			}
			return response.json()
		},
	})

	if (isLoading) {
		return (
			<div className="space-y-3">
				{[...Array(3)].map((_, i) => (
					<div key={i} className="flex items-center gap-3">
						<Skeleton className="h-10 w-10 rounded-full" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-48" />
						</div>
						<Skeleton className="h-5 w-16" />
					</div>
				))}
			</div>
		)
	}

	if (error) {
		return <div className="text-sm text-destructive">Error loading users: {error instanceof Error ? error.message : 'Unknown error'}</div>
	}

	if (!users || users.length === 0) {
		return <div className="text-sm text-muted-foreground">No users found</div>
	}

	return (
		<div className="space-y- divide-y">
			{users.map(user => (
				<div key={user.id} className="py-1">
					<div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
						<UserAvatar name={user.name || user.email} image={user.image} className="w-10 h-10" />
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="font-medium text-sm truncate">{user.name || 'No name'}</span>
							</div>
							<div className="text-xs text-muted-foreground truncate">{user.email}</div>
						</div>
						<div className="text-xs text-muted-foreground capitalize">
							<UserBadge user={user} />
							{/* {user.role} */}
						</div>
					</div>
				</div>
			))}
		</div>
	)
}
