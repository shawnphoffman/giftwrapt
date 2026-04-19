import { ArrowBigDown, ArrowBigUp, Zap } from 'lucide-react'

import type { Priority } from '@/db/schema/enums'
import { cn } from '@/lib/utils'

type PriorityIconProps = {
	priority: Priority
	className?: string
}

export default function PriorityIcon({ priority, className }: PriorityIconProps) {
	switch (priority) {
		case 'very-high':
			return <Zap className={cn('size-4 text-yellow-400 animate-pulse', className)} />
		case 'high':
			return <ArrowBigUp className={cn('size-4 text-orange-500', className)} />
		case 'low':
			return <ArrowBigDown className={cn('size-4 text-blue-400', className)} />
		case 'normal':
		default:
			return <span aria-hidden className={cn('inline-block size-4 shrink-0', className)} />
	}
}
