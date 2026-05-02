import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'

import { getUsersAsAdmin } from '@/api/admin'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { User } from '@/db-collections/users'
import { useAppSetting } from '@/hooks/use-app-settings'

// Renders inside /admin when `require2faForAdmins` is on and any admin
// account still lacks 2FA. The middleware no longer hard-bounces those
// users, so this is the visible nudge replacing it.
export function Admin2faBanner() {
	const required = useAppSetting('require2faForAdmins')
	const { data: users = [] } = useQuery<Array<User>>({
		queryKey: ['admin', 'users'],
		queryFn: async () => await getUsersAsAdmin(),
		staleTime: 10 * 60 * 1000,
		enabled: required,
	})

	if (!required) return null
	const admins = users.filter(u => u.role === 'admin')
	const missing = admins.filter(u => !u.twoFactorEnabled)
	if (missing.length === 0) return null

	const names = missing.map(u => u.name || u.email).join(', ')

	return (
		<Alert variant="destructive" className="max-w-4xl">
			<ShieldAlert className="size-4" />
			<AlertTitle>{missing.length === 1 ? '1 admin is missing 2FA' : `${missing.length} admins are missing 2FA`}</AlertTitle>
			<AlertDescription>
				<p>
					App policy requires admins to enroll TOTP two-factor auth. Ask {names} to set it up at{' '}
					<Link to="/settings/security" className="underline underline-offset-2">
						/settings/security
					</Link>
					.
				</p>
			</AlertDescription>
		</Alert>
	)
}
