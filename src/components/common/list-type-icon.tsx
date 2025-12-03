import { Cake, CheckCheck, FlaskConical, Gift, Lightbulb, TreePine } from 'lucide-react'
import type { ListType } from '@/db/enums'
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
	if (type === 'todos') {
		return <CheckCheck className={cn('text-orange-500', className)} />
	}
	if (type === 'test') {
		return <FlaskConical className={cn('text-blue-500', className)} />
	}
	return null
}
