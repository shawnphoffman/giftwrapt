import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'

type UserAvatarProps = {
	name: string
	image?: string | null
	className?: string
}

export default function UserAvatar({ name, image, className }: UserAvatarProps) {
	const initials = name?.charAt(0).toUpperCase() || '?'
	return (
		<Avatar className={cn('w-8 h-8', className)}>
			<AvatarImage src={image || undefined} alt={name || 'User avatar'} />
			<AvatarFallback className="font-bold bg-background text-foreground leading-none">{initials}</AvatarFallback>
		</Avatar>
	)
}
