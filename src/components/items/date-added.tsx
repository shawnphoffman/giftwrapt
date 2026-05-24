import { format, isThisYear } from 'date-fns'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Props = {
	createdAt: Date | string | null | undefined
	className?: string
}

export function DateAdded({ createdAt, className }: Props) {
	if (!createdAt) return null
	const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
	if (Number.isNaN(date.getTime())) return null
	const short = isThisYear(date) ? format(date, 'MMM d') : format(date, 'MMM d, yyyy')
	const full = format(date, 'MMM d, yyyy')
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className={cn(
						'inline-flex items-center shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap',
						className
					)}
				>
					{short}
				</span>
			</TooltipTrigger>
			<TooltipContent>Added {full}</TooltipContent>
		</Tooltip>
	)
}
