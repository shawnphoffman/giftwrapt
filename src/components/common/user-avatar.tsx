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
		large: 'size-18',
		medium: 'size-10',
		small: 'size-6',
	}
	const fallbackVariants = {
		huge: 'text-6xl',
		large: 'text-4xl',
		medium: 'text-2xl',
		small: 'text-sm',
	}
	return (
		<Avatar className={cn('border border-foreground/50', parentVariants[size], className)}>
			<AvatarImage src={image || undefined} alt={''} />
			<AvatarFallback className={cn('font-bold bg-background text-foreground leading-none', fallbackVariants[size])}>
				{initials}
			</AvatarFallback>
		</Avatar>
	)
}
