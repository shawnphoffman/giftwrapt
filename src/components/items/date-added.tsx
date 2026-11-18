import { isThisYear } from 'date-fns'

import { TapTooltip, TapTooltipContent, TapTooltipTrigger } from '@/components/ui/tooltip'
import { formatDate } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

type Props = {
	createdAt: Date | string | null | undefined
	className?: string
}

export function DateAdded({ createdAt, className }: Props) {
	if (!createdAt) return null
	const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
	if (Number.isNaN(date.getTime())) return null
	const full = formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' })
	const short = isThisYear(date) ? formatDate(date, { month: 'short', day: 'numeric' }) : full
	return (
		<TapTooltip>
			<TapTooltipTrigger asChild>
				<span
					className={cn(
						'inline-flex items-center shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap',
						className
					)}
				>
					{short}
				</span>
			</TapTooltipTrigger>
			<TapTooltipContent>{m.items_date_added_tooltip({ date: full })}</TapTooltipContent>
		</TapTooltip>
	)
}
