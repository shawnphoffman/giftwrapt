import type { User } from '@/db-collections/users'

import { Badge } from '../ui/badge'

export default function UserBadge({ user }: { user: User }) {
	const variant = user.role === 'admin' ? 'destructive' : user.role === 'child' ? 'default' : 'secondary'
	const label = user.role === 'admin' ? 'Admin' : user.role
	return (
		<Badge variant={variant} className="px-1 rounded leading-none">
			{label}
		</Badge>
	)
}
