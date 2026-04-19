import { ArrowDown } from 'lucide-react'

import type { GroupType } from '@/db/schema/enums'

export function GroupConnector({ type }: { type: GroupType }) {
	return (
		<div className="relative z-10 flex items-center justify-center h-0" aria-hidden>
			<span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold tracking-wider rounded-full border bg-accent text-muted-foreground">
				{type === 'or' ? 'OR' : <ArrowDown className="size-3" />}
			</span>
		</div>
	)
}
