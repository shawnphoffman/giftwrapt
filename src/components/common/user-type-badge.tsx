import type { User } from '@/db-collections/users'
import { m } from '@/paraglide/messages.js'

import { Badge } from '../ui/badge'

// "Admin", "User", "Child". A role this file does not know keeps its stored
// name, capitalized.
function roleLabel(role: string): string {
	switch (role) {
		case 'admin':
			return m.shared_role_admin()
		case 'user':
			return m.shared_role_user()
		case 'child':
			return m.shared_role_child()
		default:
			return role.charAt(0).toUpperCase() + role.slice(1)
	}
}

export default function UserTypeBadge({ user }: { user: User }) {
	const variant = user.role === 'admin' ? 'destructive' : user.role === 'child' ? 'default' : 'secondary'
	const label = roleLabel(user.role)
	return (
		<Badge variant={variant} className="px-1 rounded leading-none">
			{label}
		</Badge>
	)
}
