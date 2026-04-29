import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, List } from 'lucide-react'

import { getListSummaries } from '@/api/lists'
import { cn } from '@/lib/utils'

type Props = {
	from: number | undefined
	className?: string
}

export default function BackToParentList({ from, className }: Props) {
	const { data } = useQuery({
		queryKey: ['list-summaries', from !== undefined ? [from] : []],
		queryFn: () => getListSummaries({ data: { listIds: from !== undefined ? [from] : [] } }),
		enabled: from !== undefined,
		staleTime: 60_000,
	})

	const summary = data?.summaries[0]
	if (from === undefined || !summary) return null

	return (
		<Link
			to="/lists/$listId"
			params={{ listId: String(summary.id) }}
			className={cn(
				'group inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium',
				'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300/70 shadow-sm',
				'hover:bg-emerald-200 hover:ring-emerald-400 hover:shadow',
				'dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800/80',
				'dark:hover:bg-emerald-900 dark:hover:ring-emerald-700',
				'transition-all',
				className
			)}
		>
			<ChevronLeft className="size-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
			<span className="text-emerald-700/80 dark:text-emerald-300/80">Back to</span>
			<List className="size-3.5 shrink-0" />
			<span className="truncate font-semibold">{summary.name}</span>
		</Link>
	)
}
