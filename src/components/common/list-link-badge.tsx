import { Link } from '@tanstack/react-router'
import { List } from 'lucide-react'

import { cn } from '@/lib/utils'

type Props = {
	listId: number
	name: string
	className?: string
}

export default function ListLinkBadge({ listId, name, className }: Props) {
	return (
		<Link
			to="/lists/$listId"
			params={{ listId: String(listId) }}
			className={cn(
				'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-normal bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900 transition-colors max-w-[40%] cursor-pointer',
				className
			)}
		>
			<List className="size-3 shrink-0" />
			<span className="truncate">{name}</span>
		</Link>
	)
}
