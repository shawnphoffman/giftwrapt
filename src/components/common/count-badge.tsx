import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type CountBadgeProps = {
	count: number
	remaining: number
}

export default function CountBadge({ count, remaining }: CountBadgeProps) {
	if (count === 0) return null
	const allClaimed = remaining === 0
	return (
		<Badge
			variant="outline"
			className={cn(
				'gap-0.5 leading-snug items-end py-1 px-1 rounded-sm text-xs whitespace-nowrap inline-flex bg-muted text-foreground border-border',
				allClaimed && 'text-muted-foreground bg-muted/50 border-border/50 opacity-60'
			)}
		>
			<span className="text-[9px] leading-none text-muted-foreground self-start">{remaining}</span>
			<span className="self-start text-xs leading-none text-muted-foreground/50">/</span>
			<span className="self-end leading-none">{count}</span>
		</Badge>
	)
}
