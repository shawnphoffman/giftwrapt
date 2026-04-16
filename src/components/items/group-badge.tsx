import { ListOrdered, Shuffle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { GroupType } from '@/db/schema/enums'

type Props = {
	type: GroupType
	className?: string
}

/**
 * Visual indicator for an item group on both the edit and view pages.
 */
export function GroupBadge({ type, className }: Props) {
	if (type === 'or') {
		return (
			<Badge variant="outline" className={className}>
				<Shuffle className="size-3 mr-1" />
				Pick one
			</Badge>
		)
	}
	return (
		<Badge variant="outline" className={className}>
			<ListOrdered className="size-3 mr-1" />
			In order
		</Badge>
	)
}
