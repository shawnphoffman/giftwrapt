import { ArrowDown, ArrowUp, ArrowUpDown, Check, Filter } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { GroupSummary, ItemWithGifts } from '@/api/lists'
import EmptyMessage from '@/components/common/empty-message'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Priority } from '@/db/schema/enums'
import { buildListEntries, type ListEntry } from '@/lib/list-entries'
import { cn } from '@/lib/utils'

import { GroupViewBlock } from './group-view-block'
import ItemRow from './item-row'

type Props = {
	items: Array<ItemWithGifts>
	groups?: Array<GroupSummary>
}

type FilterValue = 'all' | 'unpurchased' | 'purchased'
type SortValue = 'priority-desc' | 'priority-asc' | 'date-desc' | 'date-asc'

const filterLabels: Record<FilterValue, string> = {
	all: 'All items',
	unpurchased: 'Unpurchased',
	purchased: 'Purchased',
}

const sortLabels: Record<SortValue, string> = {
	'priority-desc': 'Priority',
	'priority-asc': 'Priority',
	'date-desc': 'Newest',
	'date-asc': 'Oldest',
}

const priorityRank: Record<Priority, number> = { 'very-high': 4, high: 3, normal: 2, low: 1 }

function entryDateMs(entry: ListEntry<ItemWithGifts>): number {
	const raw =
		entry.kind === 'item'
			? entry.item.createdAt
			: entry.items.reduce<Date | null>((acc, i) => {
					const d = i.createdAt
					if (!d) return acc
					if (!acc) return d
					return d < acc ? d : acc
				}, null)
	if (!raw) return 0
	return raw instanceof Date ? raw.getTime() : new Date(raw).getTime()
}

function compareEntries(sort: SortValue) {
	return (a: ListEntry<ItemWithGifts>, b: ListEntry<ItemWithGifts>) => {
		if (sort === 'priority-desc' || sort === 'priority-asc') {
			const diff = priorityRank[b.priority] - priorityRank[a.priority]
			const signed = sort === 'priority-desc' ? diff : -diff
			if (signed !== 0) return signed
			return a.id - b.id
		}
		const aMs = entryDateMs(a)
		const bMs = entryDateMs(b)
		if (aMs !== bMs) return sort === 'date-desc' ? bMs - aMs : aMs - bMs
		return a.id - b.id
	}
}

function sortIsDescending(sort: SortValue): boolean {
	return sort === 'priority-desc' || sort === 'date-desc'
}

export default function ItemList({ items, groups = [] }: Props) {
	const [filter, setFilter] = useState<FilterValue>('all')
	const [sort, setSort] = useState<SortValue>('priority-desc')

	const filteredItems = useMemo(() => {
		if (filter === 'all') return items
		if (filter === 'unpurchased') return items.filter(i => i.gifts.length === 0)
		return items.filter(i => i.gifts.length > 0)
	}, [items, filter])

	const entries = useMemo(() => {
		const base = buildListEntries({ items: filteredItems, groups })
		return [...base].sort(compareEntries(sort))
	}, [filteredItems, groups, sort])

	if (items.length === 0) {
		return <EmptyMessage message="No items to display" />
	}

	const SortDirectionIcon = sortIsDescending(sort) ? ArrowDown : ArrowUp

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-row items-center justify-end gap-1">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className={cn('h-7 text-xs text-muted-foreground', filter !== 'all' && 'text-foreground')}
						>
							<Filter className="size-3.5" />
							{filterLabels[filter]}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Filter</DropdownMenuLabel>
						{(['all', 'unpurchased', 'purchased'] as const).map(v => (
							<DropdownMenuItem key={v} onClick={() => setFilter(v)}>
								<Check className={cn('size-4', filter !== v && 'opacity-0')} />
								{filterLabels[v]}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
							<ArrowUpDown className="size-3.5" />
							{sortLabels[sort]}
							<SortDirectionIcon className="size-3" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Sort by priority</DropdownMenuLabel>
						<DropdownMenuItem onClick={() => setSort('priority-desc')}>
							<Check className={cn('size-4', sort !== 'priority-desc' && 'opacity-0')} />
							High to Low
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setSort('priority-asc')}>
							<Check className={cn('size-4', sort !== 'priority-asc' && 'opacity-0')} />
							Low to High
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Sort by date</DropdownMenuLabel>
						<DropdownMenuItem onClick={() => setSort('date-desc')}>
							<Check className={cn('size-4', sort !== 'date-desc' && 'opacity-0')} />
							Newest first
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setSort('date-asc')}>
							<Check className={cn('size-4', sort !== 'date-asc' && 'opacity-0')} />
							Oldest first
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{entries.length === 0 ? (
				<EmptyMessage message="No items match the current filter" />
			) : (
				<div className="flex flex-col gap-2 pl-6">
					{entries.map(entry =>
						entry.kind === 'item' ? (
							<ItemRow key={`item-${entry.item.id}`} item={entry.item} />
						) : (
							<GroupViewBlock key={`group-${entry.group.id}`} group={entry.group} items={entry.items} />
						)
					)}
				</div>
			)}
		</div>
	)
}
