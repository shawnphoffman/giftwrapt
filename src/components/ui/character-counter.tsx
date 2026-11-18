import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/i18n/format'

type Props = {
	value: string
	max: number
	className?: string
}

export function CharacterCounter({ value, max, className }: Props) {
	const len = value.length
	const near = len >= Math.floor(max * 0.9)
	const over = len > max
	return (
		<span
			aria-live="polite"
			className={cn(
				'text-xs tabular-nums text-muted-foreground',
				near && !over && 'text-amber-600 dark:text-amber-500',
				over && 'text-destructive',
				className
			)}
		>
			{formatNumber(len)} / {formatNumber(max)}
		</span>
	)
}
