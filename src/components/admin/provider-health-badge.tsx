import { AlertTriangle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { describeProviderHealth, type ProviderHealth } from './provider-health'

// Small warning badge for a scrape provider that never or mostly fails.
// The full sentence ("0 of 48 attempts succeeded in the last 30 days,
// mostly timeout.") is in the title tooltip and the accessible label.
// `labelClassName` lets a cramped layout hide the text below a breakpoint
// and keep just the icon; the full sentence stays in the accessible label.
export function ProviderHealthBadge({
	health,
	windowLabel,
	className,
	labelClassName,
}: {
	health: ProviderHealth
	windowLabel: string
	className?: string
	labelClassName?: string
}) {
	const { label, detail } = describeProviderHealth(health, windowLabel)
	return (
		<Badge
			variant="outline"
			title={detail}
			aria-label={`${label}. ${detail}`}
			className={cn(
				'gap-1 text-[10px] font-sans shrink-0',
				health.status === 'dead' ? 'border-destructive/50 text-destructive' : 'border-amber-500/50 text-amber-700 dark:text-amber-400',
				className
			)}
		>
			<AlertTriangle className="size-3" aria-hidden="true" />
			<span className={labelClassName}>{label}</span>
		</Badge>
	)
}
