import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Filter, Store } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { ItemWithGifts } from '@/api/items'
import type { GroupSummary } from '@/api/lists'
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
import { listItemsViewQueryOptions } from '@/lib/queries/items'
import { getVendorFromUrl, vendorIdToName } from '@/lib/urls'
import { cn } from '@/lib/utils'

import { GroupViewBlock } from './group-view-block'
import ItemRow from './item-row'

type Props = {
	listId: number
	groups?: Array<GroupSummary>
}

type FilterValue = 'all' | 'unpurchased' | 'purchased'
type SortValue = 'priority-desc' | 'priority-asc' | 'date-desc' | 'date-asc'

// Synthetic vendor id for items without a URL. Real vendor ids come from
// hostnames or the rule table in src/lib/urls.ts, neither of which produces
// a leading underscore - safe sentinel.
const NO_LINK_VENDOR_ID = '__no_link__'

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

export default function ItemList({ listId, groups = [] }: Props) {
	const { data: items } = useSuspenseQuery(listItemsViewQueryOptions(listId))
	const [filter, setFilter] = useState<FilterValue>('all')
	const [vendorFilter, setVendorFilter] = useState<ReadonlySet<string>>(() => new Set())
	const [sort, setSort] = useState<SortValue>('priority-desc')

	// Effective vendor id for an item: stored vendorId, or derived from url
	// if vendorId hasn'''t been backfilled yet. NO_LINK only when there'''s no
	// url at all.
	const effectiveVendorId = (i: { vendorId: string | null; url: string | null }): string => {
		if (i.vendorId) return i.vendorId
		const fromUrl = i.url ? getVendorFromUrl(i.url)?.id : null
		return fromUrl ?? NO_LINK_VENDOR_ID
	}

	const vendorOptions = useMemo(() => {
		const seenIds = new Set<string>()
		const opts: Array<{ id: string; name: string }> = []
		let hasNoLink = false
		for (const i of items) {
			const id = effectiveVendorId(i)
			if (id === NO_LINK_VENDOR_ID) {
				hasNoLink = true
				continue
			}
			if (!seenIds.has(id)) {
				seenIds.add(id)
				opts.push({ id, name: vendorIdToName(id) })
			}
		}
		opts.sort((a, b) => a.name.localeCompare(b.name))
		if (hasNoLink) opts.push({ id: NO_LINK_VENDOR_ID, name: 'No link' })
		return opts
	}, [items])

	const filteredItems = useMemo(() => {
		let out = items
		if (filter === 'unpurchased') out = out.filter(i => i.gifts.length === 0)
		else if (filter === 'purchased') out = out.filter(i => i.gifts.length > 0)
		if (vendorFilter.size > 0) {
			out = out.filter(i => vendorFilter.has(effectiveVendorId(i)))
		}
		return out
	}, [items, filter, vendorFilter])

	const entries = useMemo(() => {
		const base = buildListEntries({ items: filteredItems, groups })
		return [...base].sort(compareEntries(sort))
	}, [filteredItems, groups, sort])

	if (items.length === 0) {
		return <EmptyMessage message="No items to display" className="xs:ml-6" />
	}

	const toggleVendor = (id: string) => {
		setVendorFilter(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	let vendorLabel: string
	if (vendorFilter.size === 0) {
		vendorLabel = 'All vendors'
	} else if (vendorFilter.size === 1) {
		const [only] = vendorFilter
		vendorLabel = only === NO_LINK_VENDOR_ID ? 'No link' : vendorIdToName(only)
	} else {
		vendorLabel = `${vendorFilter.size} vendors`
	}

	const SortDirectionIcon = sortIsDescending(sort) ? ArrowDown : ArrowUp

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-row items-center justify-end gap-1">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="sm" className={cn('h-7 text-xs text-muted-foreground', filter !== 'all' && 'text-foreground')}>
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

				{vendorOptions.length >= 1 && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className={cn('h-7 text-xs text-muted-foreground', vendorFilter.size > 0 && 'text-foreground')}
							>
								<Store className="size-3.5" />
								{vendorLabel}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Vendor</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => setVendorFilter(new Set())}>
								<Check className={cn('size-4', vendorFilter.size > 0 && 'opacity-0')} />
								All vendors
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							{vendorOptions.map(v => (
								<DropdownMenuItem key={v.id} onClick={() => toggleVendor(v.id)} onSelect={e => e.preventDefault()}>
									<Check className={cn('size-4', !vendorFilter.has(v.id) && 'opacity-0')} />
									{v.name}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				)}

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
				<EmptyMessage message="No items match the current filter" className="xs:ml-6" />
			) : (
				<div className="flex flex-col gap-2 xs:pl-6">
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
