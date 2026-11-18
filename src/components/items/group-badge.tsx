import { CircleDot, ListOrdered } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { TapTooltip, TapTooltipContent, TapTooltipTrigger } from '@/components/ui/tooltip'
import type { GroupType } from '@/db/schema/enums'
import { m } from '@/paraglide/messages.js'

type Props = {
	type: GroupType
	className?: string
}

// A function, not a table: a table would be built once at module load, in
// whatever language was current then.
function groupCopy(type: GroupType): { label: string; help: string } {
	switch (type) {
		case 'or':
			return { label: m.items_group_type_or(), help: m.items_group_type_or_help() }
		case 'order':
			return { label: m.items_group_type_order(), help: m.items_group_type_order_help() }
	}
}

export function GroupBadge({ type, className }: Props) {
	const Icon = type === 'or' ? CircleDot : ListOrdered
	const { label, help } = groupCopy(type)

	return (
		<TapTooltip>
			<TapTooltipTrigger asChild>
				<Badge variant="outline" className={className}>
					<Icon />
					<span className="hidden sm:inline">{label}</span>
				</Badge>
			</TapTooltipTrigger>
			<TapTooltipContent className="max-w-64 text-xs leading-relaxed" side="top" align="start">
				{help}
			</TapTooltipContent>
		</TapTooltip>
	)
}
