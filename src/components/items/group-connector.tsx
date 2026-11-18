import { ArrowDown } from 'lucide-react'

import type { GroupType } from '@/db/schema/enums'
import { m } from '@/paraglide/messages.js'

export function GroupConnector({ type }: { type: GroupType }) {
	return (
		<div className="relative z-10 flex items-center justify-center h-0" aria-hidden>
			<span className="flex items-center gap-1 px-2 py-0.5 text-3xs font-semibold tracking-wider rounded-full border bg-accent text-muted-foreground">
				{type === 'or' ? m.items_group_connector_or() : <ArrowDown className="size-3" />}
			</span>
		</div>
	)
}
