import type { User } from '@/db-collections/users'

import { Badge } from '../ui/badge'

export default function UserBadge({ user }: { user: User }) {
	const variant = user.role === 'admin' ? 'destructive' : user.role === 'child' ? 'default' : 'secondary'
	const label = user.role.charAt(0).toUpperCase() + user.role.slice(1)
	return (
		<Badge variant={variant} className="px-1 rounded leading-none">
			{label}
		</Badge>
	)
}
