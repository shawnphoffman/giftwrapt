import { CircleQuestionMark } from 'lucide-react'

import { cn } from '@/lib/utils'

import { TapTooltip, TapTooltipContent, TapTooltipTrigger } from '../ui/tooltip'

type InputTooltipProps = {
	children: React.ReactNode
	className?: string
}

export default function InputTooltip({ children, className }: InputTooltipProps) {
	return (
		<TapTooltip>
			<TapTooltipTrigger className="text-muted-foreground">
				<CircleQuestionMark className="size-4" />
			</TapTooltipTrigger>
			<TapTooltipContent className={cn('max-w-52 w-fit text-pretty', className)}>{children}</TapTooltipContent>
		</TapTooltip>
	)
}
