import { Sprout } from 'lucide-react'

import { cn } from '@/lib/utils'

import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'

type DependentAvatarProps = {
	name: string
	image?: string | null
	className?: string
	size?: 'small' | 'medium' | 'large' | 'huge'
}

// Single icon for every dependent. The Sprout fallback is intentionally
// neutral so a baby and a pet read the same in the UI - the user's name
// disambiguates. Mirrors the avatar-conventions in `architecture.md`
// (avatar + name everywhere a user is selectable).
export default function DependentAvatar({ name, image, className, size = 'medium' }: DependentAvatarProps) {
	const parentVariants = {
		huge: 'size-28',
		large: 'size-18',
		medium: 'size-10',
		small: 'size-6',
	}
	const iconVariants = {
		huge: 'size-14',
		large: 'size-10',
		medium: 'size-5',
		small: 'size-3',
	}
	return (
		<Avatar className={cn('', parentVariants[size], className)}>
			<AvatarImage src={image || undefined} alt={name} />
			<AvatarFallback className={cn('bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300')}>
				<Sprout className={iconVariants[size]} aria-label={name} />
			</AvatarFallback>
		</Avatar>
	)
}
