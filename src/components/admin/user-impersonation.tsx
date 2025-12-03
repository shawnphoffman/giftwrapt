import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authClient, useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { User } from '@/db-collections/users'
import { toast } from 'sonner'
import { getUsersAsAdmin } from '@/api/admin'
import LoadingSkeleton from '../skeletons/loading-skeleton'

export function UserImpersonation() {
	const [selectedUserId, setSelectedUserId] = useState<string>('')
	const [isImpersonating, setIsImpersonating] = useState(false)
	const { data: session } = useSession()
	const currentUserId = session?.user?.id

	const {
		data: allUsers = [],
		isLoading,
		error,
	} = useQuery<User[]>({
		queryKey: ['admin', 'users'],
		queryFn: async () => {
			return await getUsersAsAdmin()
		},
	})

	// Filter out the current user since you can't impersonate yourself
	const users = useMemo(() => {
		if (!currentUserId) return allUsers
		return allUsers.filter(user => user.id !== currentUserId)
	}, [allUsers, currentUserId])

	const handleImpersonate = async () => {
		if (!selectedUserId) {
			toast.error('Please select a user to impersonate')
			return
		}

		try {
			setIsImpersonating(true)
			const result = await authClient.admin.impersonateUser({
				userId: selectedUserId,
			})

			if (result.error) {
				toast.error(result.error.message || 'Failed to impersonate user')
			} else {
				toast.success('Impersonation started successfully')
				// Reload the page to reflect the new session
				window.location.href = '/'
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to impersonate user')
		} finally {
			setIsImpersonating(false)
		}
	}

	if (isLoading) {
		return <LoadingSkeleton />
	}

	if (error) {
		return <div className="text-sm text-destructive">Error loading users: {error instanceof Error ? error.message : 'Unknown error'}</div>
	}

	if (!users || users.length === 0) {
		return <div className="text-sm text-muted-foreground">No users found</div>
	}

	return (
		<div className="flex flex-col gap-3 max-w-md mx-auto">
			<Select value={selectedUserId} onValueChange={setSelectedUserId}>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="Select a user to impersonate" />
				</SelectTrigger>
				<SelectContent>
					{users.map(user => (
						<SelectItem key={user.id} value={user.id}>
							{user.name || user.email}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button onClick={handleImpersonate} disabled={!selectedUserId || isImpersonating} variant="default" className="w-full">
				{isImpersonating ? 'Impersonating...' : 'Impersonate User'}
			</Button>
		</div>
	)
}
