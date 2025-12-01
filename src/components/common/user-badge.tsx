import { User } from '@/db-collections/users'
import { Badge } from '../ui/badge'

export default function UserBadge({ user }: { user: User }) {
	const variant = user.isAdmin ? 'destructive' : 'secondary'
	const label = user.isAdmin ? 'Admin' : 'User'
	return (
		<Badge variant={variant} className="px-1 rounded leading-none">
			{label}
		</Badge>
	)
}
