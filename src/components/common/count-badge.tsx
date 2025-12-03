import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type CountBadgeProps = {
	count: number
	remaining: number
}

export default function CountBadge({ count, remaining }: CountBadgeProps) {
	if (count === 0) return null
	return (
		<Badge
			variant="secondary"
			className={cn(
				'gap-0.5 leading-snug items-end py-1 px-1 rounded-sm text-xs whitespace-nowrap inline-flex',
				count > 0 ? '' : 'text-muted-foreground'
			)}
		>
			{remaining !== 0 && (
				<>
					<span className="text-[9px] leading-none text-muted-foreground self-start">{remaining}</span>
					<span className="self-start text-xs leading-none text-muted-foreground/50">/</span>
				</>
			)}
			<span className="self-end leading-none">{count}</span>
		</Badge>
	)
}
