import { cn } from '@/lib/utils'

type Props = {
	message: string
	className?: string
}

export default function EmptyMessage({ message, className }: Props) {
	return (
		<div className={cn('text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30', className)}>{message}</div>
	)
}
