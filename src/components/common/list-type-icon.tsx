import { Cake, CheckCheck, FlaskConical, Gift, Lightbulb, PartyPopper, TreePine } from 'lucide-react'

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
	if (type === 'christmas') {
		return <TreePine className={cn('text-green-500', className)} />
	}
	if (type === 'birthday') {
		return <Cake className={cn('text-pink-500', className)} />
	}
	if (type === 'giftideas') {
		return <Lightbulb className={cn('text-teal-500', className)} />
	}
	if (type === 'holiday') {
		return <PartyPopper className={cn('text-amber-500', className)} />
	}
	if (type === 'todos') {
		return <CheckCheck className={cn('text-orange-500', className)} />
	}
	return <FlaskConical className={cn('text-blue-500', className)} />
}
