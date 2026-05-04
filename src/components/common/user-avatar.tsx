import { avatarColorClass } from '@/lib/avatar-color'
import { cn } from '@/lib/utils'

import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'

type UserAvatarProps = {
	name: string
	image?: string | null
	className?: string
	size?: 'small' | 'medium' | 'large' | 'huge'
}

export default function UserAvatar({ name, image, className, size = 'medium' }: UserAvatarProps) {
	const initials = name.charAt(0).toUpperCase() || '?'
	const parentVariants = {
		huge: 'size-28',
		large: 'xs:size-18 size-12',
		medium: 'size-10',
		small: 'size-6',
	}
	const fallbackVariants = {
		huge: 'text-6xl',
		large: 'xs:text-4xl text-2xl',
		medium: 'text-2xl',
		small: 'text-sm',
	}
	return (
		<Avatar className={cn('', parentVariants[size], className)}>
			<AvatarImage src={image || undefined} alt={''} />
			<AvatarFallback className={cn('font-bold text-white leading-none', avatarColorClass(name), fallbackVariants[size])}>
				{initials}
			</AvatarFallback>
		</Avatar>
	)
}
