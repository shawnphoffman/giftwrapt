import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { getUsersAsAdmin } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { User } from '@/db-collections/users'
import { authClient, useSession } from '@/lib/auth-client'
import { authErrorText, errorText } from '@/lib/i18n/errors'
import { forgetSkeletonShapes } from '@/lib/skullet'
import { m } from '@/paraglide/messages.js'

import UserAvatar from '../common/user-avatar'
import LoadingSkeleton from '../skeletons/loading-skeleton'

export function UserImpersonation() {
	const [selectedUserId, setSelectedUserId] = useState<string>('')
	const [isImpersonating, setIsImpersonating] = useState(false)
	const { data: session } = useSession()
	const currentUserId = session?.user.id

	const {
		data: allUsers = [],
		isLoading,
		error,
	} = useQuery<Array<User>>({
		queryKey: ['admin', 'users'],
		queryFn: async () => {
			return await getUsersAsAdmin()
		},
		staleTime: 10 * 60 * 1000,
	})

	// Filter out the current user since you can't impersonate yourself
	const users = useMemo(() => {
		if (!currentUserId) return allUsers
		return allUsers.filter(user => user.id !== currentUserId)
	}, [allUsers, currentUserId])

	const handleImpersonate = async () => {
		if (!selectedUserId) {
			toast.error(m.admin_users_impersonate_select_required())
			return
		}

		try {
			setIsImpersonating(true)
			const result = await authClient.admin.impersonateUser({
				userId: selectedUserId,
			})

			if (result.error) {
				toast.error(authErrorText(result.error, m.admin_users_impersonate_failed()))
			} else {
				toast.success(m.admin_users_impersonate_started())
				forgetSkeletonShapes()
				// Reload the page to reflect the new session
				window.location.href = '/'
			}
		} catch (err) {
			toast.error(errorText(err, m.admin_users_impersonate_failed()))
		} finally {
			setIsImpersonating(false)
		}
	}

	if (isLoading) {
		return <LoadingSkeleton />
	}

	if (error) {
		return (
			<div className="text-sm text-destructive">
				{m.admin_users_list_load_error({ error: error instanceof Error ? error.message : m.admin_users_unknown_error() })}
			</div>
		)
	}

	if (users.length === 0) {
		return <div className="text-sm text-muted-foreground">{m.admin_users_list_empty()}</div>
	}

	return (
		<div className="flex flex-col @sm/admin-content:flex-row gap-3 mx-auto">
			<Select value={selectedUserId} onValueChange={setSelectedUserId}>
				<SelectTrigger className="w-full">
					<SelectValue placeholder={m.admin_users_impersonate_placeholder()} />
				</SelectTrigger>
				<SelectContent>
					{users.map(user => (
						<SelectItem key={user.id} value={user.id}>
							<UserAvatar name={user.name || user.email} image={user.image} size="small" />
							<span className="text-base font-medium truncate">{user.name || user.email}</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button onClick={handleImpersonate} disabled={!selectedUserId || isImpersonating} variant="default" className="">
				{isImpersonating ? m.admin_users_impersonate_busy() : m.admin_users_impersonate_submit()}
			</Button>
		</div>
	)
}
