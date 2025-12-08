import { CircleQuestionMark } from 'lucide-react'

import { cn } from '@/lib/utils'

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

type InputTooltipProps = {
	children: React.ReactNode
	className?: string
}

export default function InputTooltip({ children, className }: InputTooltipProps) {
	return (
		<Tooltip>
			<TooltipTrigger className="text-muted-foreground">
				<CircleQuestionMark className="size-4" />
			</TooltipTrigger>
			<TooltipContent className={cn('max-w-52 w-fit text-pretty', className)}>{children}</TooltipContent>
		</Tooltip>
	)
}
