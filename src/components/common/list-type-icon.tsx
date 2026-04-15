import { CheckCheck, Gift, Lightbulb } from 'lucide-react'

import type { ListType } from '@/db/schema/enums'
import { cn } from '@/lib/utils'

type ListTypeIconProps = {
	type: ListType
	className?: string
}
export default function ListTypeIcon({ type, className }: ListTypeIconProps) {
	if (type === 'wishlist') {
		return <Gift className={cn('text-red-500', className)} />
	}
	if (type === 'giftideas') {
		return <Lightbulb className={cn('text-teal-500', className)} />
	}
	if (type === 'todo') {
		return <CheckCheck className={cn('text-orange-500', className)} />
	}
	return <Gift className={cn('text-red-500', className)} />
}
