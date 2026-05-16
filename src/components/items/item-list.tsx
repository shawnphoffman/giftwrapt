import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, DollarSign, Filter } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { ItemWithGifts } from '@/api/items'
import { getListSummaries, type GroupSummary, type ListSummary } from '@/api/lists'
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
import { Input } from '@/components/ui/input'
import type { Priority } from '@/db/schema/enums'
import { buildListEntries, type ListEntry } from '@/lib/list-entries'
import { listItemsViewQueryOptions } from '@/lib/queries/items'
import { getVendorFromUrl, isKnownVendor, parseInternalListLink, vendorIdToName } from '@/lib/urls'
import { cn } from '@/lib/utils'

import { GroupViewBlock } from './group-view-block'
import { InternalListLinksProvider } from './internal-list-links-context'
import ItemRow from './item-row'
import { VendorFilterDropdown, type VendorOption } from './vendor-filter-dropdown'

type Props = {
	listId: number
	groups?: Array<GroupSummary>
}

type FilterValue = 'all' | 'unpurchased' | 'purchased'
type SortValue = 'priority-desc' | 'priority-asc' | 'date-desc' | 'date-asc'
type PricePresetId = 'all' | 'under-25' | '25-50' | '50-100' | '100-250' | 'over-250' | 'custom'

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

const pricePresets: ReadonlyArray<{ id: Exclude<PricePresetId, 'custom' | 'all'>; label: string; min: number | null; max: number | null }> =
	[
		{ id: 'under-25', label: 'Under $25', min: null, max: 25 },
		{ id: '25-50', label: '$25 – $50', min: 25, max: 50 },
		{ id: '50-100', label: '$50 – $100', min: 50, max: 100 },
		{ id: '100-250', label: '$100 – $250', min: 100, max: 250 },
		{ id: 'over-250', label: 'Over $250', min: 250, max: null },
	]

function parsePrice(raw: string | null): number | null {
	if (!raw) return null
	const cleaned = raw.replace(/[^0-9.]/g, '')
	if (!cleaned) return null
	const n = Number.parseFloat(cleaned)
	return Number.isFinite(n) ? n : null
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
	const [pricePreset, setPricePreset] = useState<PricePresetId>('all')
	const [customMin, setCustomMin] = useState<string>('')
	const [customMax, setCustomMax] = useState<string>('')

	// Detect URLs that point at other lists in this app, batched into one
	// query so a list with N internal links makes a single roundtrip. The
	// origin check is client-side, so SSR yields an empty id list and the
	// row falls back to the standard external badge until hydration.
	const internalListIds = useMemo(() => {
		if (typeof window === 'undefined') return [] as Array<number>
		const origin = window.location.origin
		const set = new Set<number>()
		for (const i of items) {
			const hit = parseInternalListLink(i.url, origin)
			if (hit) set.add(hit.listId)
		}
		return [...set].sort((a, b) => a - b)
	}, [items])

	const { data: summaryData } = useQuery({
		queryKey: ['list-summaries', internalListIds],
		queryFn: () => getListSummaries({ data: { listIds: internalListIds } }),
		enabled: internalListIds.length > 0,
		staleTime: 60_000,
	})

	const internalListLinks = useMemo(() => {
		const map = new Map<number, ListSummary>()
		for (const s of summaryData?.summaries ?? []) map.set(s.id, s)
		return map
	}, [summaryData])

	// Effective vendor id for an item: stored vendorId, or derived from url
	// if vendorId hasn'''t been backfilled yet. NO_LINK only when there'''s no
	// url at all.
	const effectiveVendorId = (i: { vendorId: string | null; url: string | null }): string => {
		if (i.vendorId) return i.vendorId
		const fromUrl = i.url ? getVendorFromUrl(i.url)?.id : null
		return fromUrl ?? NO_LINK_VENDOR_ID
	}

	const vendorOptions = useMemo<Array<VendorOption>>(() => {
		const counts = new Map<string, number>()
		for (const i of items) {
			const id = effectiveVendorId(i)
			counts.set(id, (counts.get(id) ?? 0) + 1)
		}
		const opts: Array<VendorOption> = []
		for (const [id, count] of counts) {
			if (id === NO_LINK_VENDOR_ID) {
				opts.push({ id, name: 'No link', count, isKnown: false })
			} else {
				opts.push({ id, name: vendorIdToName(id), count, isKnown: isKnownVendor(id) })
			}
		}
		return opts
	}, [items])

	const activePriceRange = useMemo<{ min: number | null; max: number | null } | null>(() => {
		if (pricePreset === 'all') return null
		if (pricePreset === 'custom') {
			const min = parsePrice(customMin)
			const max = parsePrice(customMax)
			if (min === null && max === null) return null
			return { min, max }
		}
		const preset = pricePresets.find(p => p.id === pricePreset)
		return preset ? { min: preset.min, max: preset.max } : null
	}, [pricePreset, customMin, customMax])

	const filteredItems = useMemo(() => {
		let out = items
		if (filter === 'unpurchased') out = out.filter(i => i.gifts.length === 0)
		else if (filter === 'purchased') out = out.filter(i => i.gifts.length > 0)
		if (vendorFilter.size > 0) {
			out = out.filter(i => vendorFilter.has(effectiveVendorId(i)))
		}
		if (activePriceRange) {
			const { min, max } = activePriceRange
			out = out.filter(i => {
				const price = parsePrice(i.price)
				if (price === null) return false
				if (min !== null && price < min) return false
				if (max !== null && price > max) return false
				return true
			})
		}
		return out
	}, [items, filter, vendorFilter, activePriceRange])

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

	let priceLabel: string
	if (pricePreset === 'all' || !activePriceRange) {
		priceLabel = 'Any price'
	} else if (pricePreset === 'custom') {
		const { min, max } = activePriceRange
		if (min !== null && max !== null) priceLabel = `$${min} – $${max}`
		else if (min !== null) priceLabel = `Over $${min}`
		else if (max !== null) priceLabel = `Under $${max}`
		else priceLabel = 'Any price'
	} else {
		priceLabel = pricePresets.find(p => p.id === pricePreset)?.label ?? 'Any price'
	}

	const SortDirectionIcon = sortIsDescending(sort) ? ArrowDown : ArrowUp

	return (
		<InternalListLinksProvider value={internalListLinks}>
			<div className="flex flex-col gap-3">
				<div className="flex flex-row items-center justify-end gap-1 flex-wrap">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="xs"
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

					{vendorOptions.length >= 1 && (
						<VendorFilterDropdown
							options={vendorOptions}
							selected={vendorFilter}
							onToggle={toggleVendor}
							onClear={() => setVendorFilter(new Set())}
						/>
					)}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className={cn('h-7 text-xs text-muted-foreground', pricePreset !== 'all' && 'text-foreground')}
							>
								<DollarSign className="size-3.5" />
								{priceLabel}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Price</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => setPricePreset('all')}>
								<Check className={cn('size-4', pricePreset !== 'all' && 'opacity-0')} />
								Any price
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							{pricePresets.map(p => (
								<DropdownMenuItem key={p.id} onClick={() => setPricePreset(p.id)}>
									<Check className={cn('size-4', pricePreset !== p.id && 'opacity-0')} />
									{p.label}
								</DropdownMenuItem>
							))}
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setPricePreset('custom')} onSelect={e => e.preventDefault()}>
								<Check className={cn('size-4', pricePreset !== 'custom' && 'opacity-0')} />
								Custom
							</DropdownMenuItem>
							{pricePreset === 'custom' && (
								<div
									className="flex items-center gap-1.5 px-2 py-1.5"
									onClick={e => e.stopPropagation()}
									onKeyDown={e => e.stopPropagation()}
								>
									<Input
										type="number"
										inputMode="decimal"
										min={0}
										placeholder="Min"
										value={customMin}
										onChange={e => setCustomMin(e.target.value)}
										className="h-7 w-20 text-xs"
									/>
									<span className="text-xs text-muted-foreground">–</span>
									<Input
										type="number"
										inputMode="decimal"
										min={0}
										placeholder="Max"
										value={customMax}
										onChange={e => setCustomMax(e.target.value)}
										className="h-7 w-20 text-xs"
									/>
								</div>
							)}
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="xs" className="h-7 text-xs text-muted-foreground">
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
		</InternalListLinksProvider>
	)
}
