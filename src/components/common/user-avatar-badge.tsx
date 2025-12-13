import { cn } from '@/lib/utils'

import { Badge } from '../ui/badge'
import UserAvatar from './user-avatar'

type UserAvatarBadgeProps = {
	name: string
	image?: string | null
	className?: string
	// size?: 'small' | 'medium' | 'large' | 'huge'
}

export default function UserAvatarBadge({ name, image, className }: UserAvatarBadgeProps) {
	return (
		<Badge variant="outline" className={cn('gap-1 py-0 ps-0 pe-2 leading-none', className)}>
			<UserAvatar name={name} image={image} size="small" className="border-none" />
			<span>{name}</span>
		</Badge>
	)
}
