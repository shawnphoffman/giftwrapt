import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const AVAILABILITY_DATE_FORMAT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }

type Props = {
	changedAt?: Date | string | null
}

export function UnavailableBadge({ changedAt }: Props) {
	const badge = (
		<Badge variant="destructive" className="px-1 rounded leading-none shrink-0 cursor-default">
			Unavailable
		</Badge>
	)
	if (!changedAt) return badge
	return (
		<Tooltip>
			<TooltipTrigger asChild>{badge}</TooltipTrigger>
			<TooltipContent side="top">
				Marked unavailable on {new Date(changedAt).toLocaleDateString('en-US', AVAILABILITY_DATE_FORMAT)}
			</TooltipContent>
		</Tooltip>
	)
}
