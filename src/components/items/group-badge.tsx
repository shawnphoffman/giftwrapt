import { CircleDot, ListOrdered } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { GroupType } from '@/db/schema/enums'

type Props = {
	type: GroupType
	className?: string
}

const GROUP_COPY: Record<GroupType, { label: string; help: string }> = {
	or: {
		label: 'Pick one',
		help: 'The recipient wants one item from this group, not all. Once someone claims an item here, the others are considered fulfilled.',
	},
	order: {
		label: 'In order',
		help: 'Items in this group should be claimed in the order shown, top first. Useful when one item depends on another (e.g. a console before its controllers).',
	},
}

export function GroupBadge({ type, className }: Props) {
	const Icon = type === 'or' ? CircleDot : ListOrdered
	const { label, help } = GROUP_COPY[type]

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Badge variant="outline" className={className}>
					<Icon />
					<span className="hidden sm:inline">{label}</span>
				</Badge>
			</TooltipTrigger>
			<TooltipContent className="max-w-64 text-xs leading-relaxed" side="top" align="start">
				{help}
			</TooltipContent>
		</Tooltip>
	)
}
