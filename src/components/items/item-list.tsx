import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, DollarSign, Filter } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'

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
import { useMoney } from '@/hooks/use-money'
import { claimStatsByCategory } from '@/lib/category-claims'
import { parseAmount } from '@/lib/i18n/format'
import { type CategoryKey, categoryKeyOfEntry, type CategorySummary } from '@/lib/item-categories'
import { buildListEntries, compareWithinPriority, type ListEntry } from '@/lib/list-entries'
import { listItemsViewQueryOptions } from '@/lib/queries/items'
import { getVendorFromUrl, isKnownVendor, parseInternalListLink, vendorIdToName } from '@/lib/urls'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

import { ArrangeByToggle, type Arrangement } from './arrange-by-toggle'
import { CategoryOverview, type CategoryOverviewRow, ClaimMeter } from './category-overview'
import { GroupViewBlock } from './group-view-block'
import { InternalListLinksProvider } from './internal-list-links-context'
import ItemRow from './item-row'
import { VendorFilterDropdown, type VendorOption } from './vendor-filter-dropdown'

type Props = {
	listId: number
	groups?: Array<GroupSummary>
	// The list's categories this viewer can see (docs/logic.md "Item
	// categories"). Empty for most lists, and then nothing here changes.
	categories?: ReadonlyArray<CategorySummary>
	// Rendered inline with the right-aligned filter controls (just before
	// them). Used for the reveal-date badge.
	filterBarLeading?: ReactNode
}

type FilterValue = 'all' | 'unpurchased' | 'purchased'
type SortValue = 'priority-desc' | 'priority-asc' | 'date-desc' | 'date-asc'
type PricePresetId = 'all' | 'under-25' | '25-50' | '50-100' | '100-250' | 'over-250' | 'custom'

// Synthetic vendor id for items without a URL. Real vendor ids come from
// hostnames or the rule table in src/lib/urls.ts, neither of which produces
// a leading underscore - safe sentinel.
const NO_LINK_VENDOR_ID = '__no_link__'

// Labels are functions, not tables: a table would be built once at module
// load, in whatever language was current then.
function filterLabel(filter: FilterValue): string {
	switch (filter) {
		case 'all':
			return m.items_filter_all()
		case 'unpurchased':
			return m.items_filter_unpurchased()
		case 'purchased':
			return m.items_filter_purchased()
	}
}

function sortLabel(sort: SortValue): string {
	switch (sort) {
		case 'priority-desc':
		case 'priority-asc':
			return m.items_sort_priority()
		case 'date-desc':
			return m.items_sort_newest()
		case 'date-asc':
			return m.items_sort_oldest()
	}
}

const pricePresets: ReadonlyArray<{ id: Exclude<PricePresetId, 'custom' | 'all'>; min: number | null; max: number | null }> = [
	{ id: 'under-25', min: null, max: 25 },
	{ id: '25-50', min: 25, max: 50 },
	{ id: '50-100', min: 50, max: 100 },
	{ id: '100-250', min: 100, max: 250 },
	{ id: 'over-250', min: 250, max: null },
]

// The label of a price range, for the presets and a custom range alike.
// `price` formats a bound as money in the deployment's currency.
function priceRangeLabel(min: number | null, max: number | null, price: (value: number) => string): string {
	if (min !== null && max !== null) return m.items_price_between({ low: price(min), high: price(max) })
	if (min !== null) return m.items_price_over({ price: price(min) })
	if (max !== null) return m.items_price_under({ price: price(max) })
	return m.items_price_any_button()
}

function parsePrice(raw: string | null): number | null {
	if (!raw) return null
	// A plain amount first, so "12,50" is 12.5 and not 1250.
	const plain = parseAmount(raw)
	if (plain !== null) return plain
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
			return compareWithinPriority(a, b)
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

export default function ItemList({ listId, groups, categories, filterBarLeading }: Props) {
	const { data: items } = useSuspenseQuery(listItemsViewQueryOptions(listId))
	return <ItemListView items={items} groups={groups} categories={categories} filterBarLeading={filterBarLeading} />
}

const NO_CATEGORIES: ReadonlyArray<CategorySummary> = []

type ViewProps = Omit<Props, 'listId'> & {
	items: Array<ItemWithGifts>
}

// The list body without its query, so a loading skeleton can render the
// real layout from sample items (see list-detail-sample.ts).
export function ItemListView({ items, groups = [], categories = NO_CATEGORIES, filterBarLeading }: ViewProps) {
	const money = useMoney()
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
				opts.push({ id, name: m.items_vendor_no_link(), count, isKnown: false })
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
		const base = buildListEntries({ items: filteredItems, groups }).filter(e => e.kind !== 'group' || e.items.length > 0)
		return [...base].sort(compareEntries(sort))
	}, [filteredItems, groups, sort])

	// Categories. Nothing below renders unless the viewer can see an item
	// that has one. Like the filters, the arrangement is not saved: it
	// lands on Priority, which is today's list.
	const [arrangement, setArrangement] = useState<Arrangement>('priority')
	const [narrowTo, setNarrowTo] = useState<CategoryKey | null>(null)
	const knownCategoryIds = useMemo(() => new Set(categories.map(c => c.id)), [categories])
	// Claimed counts come from every entry the viewer was sent, not from the
	// filtered ones, so a filter never changes how claimed a category reads.
	const claimStats = useMemo(
		() =>
			claimStatsByCategory(
				buildListEntries({ items, groups }).filter(e => e.kind !== 'group' || e.items.length > 0),
				knownCategoryIds
			),
		[items, groups, knownCategoryIds]
	)
	const hasCategorized = [...claimStats.keys()].some(key => key !== 'none')

	if (items.length === 0) {
		return <EmptyMessage message={m.items_empty()} className="xs:ml-6" />
	}

	// In the owner's order, then the entries with no category.
	const categorySections: Array<{ key: CategoryKey; name: string }> = [
		...categories.map(c => ({ key: c.id as CategoryKey, name: c.name })),
		{ key: 'none', name: m.items_category_none() },
	]
	const overviewRows: Array<CategoryOverviewRow> = categorySections.flatMap(section => {
		const stats = claimStats.get(section.key)
		return stats ? [{ ...section, ...stats }] : []
	})
	// A category that has gone (deleted, or its last item removed) stops narrowing.
	const activeNarrow = hasCategorized && narrowTo !== null && claimStats.has(narrowTo) ? narrowTo : null
	const shownEntries = activeNarrow === null ? entries : entries.filter(e => categoryKeyOfEntry(e, knownCategoryIds) === activeNarrow)

	const renderEntry = (entry: ListEntry<ItemWithGifts>) =>
		entry.kind === 'item' ? (
			<div key={`item-${entry.item.id}`} className="xs:pl-6">
				<ItemRow item={entry.item} />
			</div>
		) : (
			<GroupViewBlock key={`group-${entry.group.id}`} group={entry.group} items={entry.items} />
		)

	const toggleVendor = (id: string) => {
		setVendorFilter(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	const priceLabel =
		pricePreset === 'all' || !activePriceRange
			? m.items_price_any_button()
			: priceRangeLabel(activePriceRange.min, activePriceRange.max, money.roundAmount)

	const SortDirectionIcon = sortIsDescending(sort) ? ArrowDown : ArrowUp

	return (
		<InternalListLinksProvider value={internalListLinks}>
			<div className="flex flex-col gap-3">
				{/* Phones: the leading badges and buttons get a full-width line, then
				    the filters sit in an even two-column grid (an odd one out spans
				    both) so they line up instead of wrapping raggedly. The leading
				    cell is always child 1, so an odd filter count ends on an even
				    child. From sm up: one right-aligned row. */}
				<div className="grid grid-cols-2 gap-1 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&>:last-child:nth-child(even)]:col-span-2">
					<div className="col-span-full flex flex-wrap items-center justify-end gap-1 empty:hidden sm:contents">
						{hasCategorized && <ArrangeByToggle value={arrangement} onChange={setArrangement} className="mr-auto" />}
						{filterBarLeading}
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="xs" className={cn('text-muted-foreground', filter !== 'all' && 'text-foreground')}>
								<Filter className="size-3.5" />
								{filterLabel(filter)}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">{m.items_filter_menu_label()}</DropdownMenuLabel>
							{/* eslint-disable-next-line i18next/no-literal-string -- filter values, labels come from messages */}
							{(['all', 'unpurchased', 'purchased'] as const).map(v => (
								<DropdownMenuItem key={v} onClick={() => setFilter(v)}>
									<Check className={cn('size-4', filter !== v && 'opacity-0')} />
									{filterLabel(v)}
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
							<Button variant="outline" size="xs" className={cn('text-muted-foreground', pricePreset !== 'all' && 'text-foreground')}>
								<DollarSign className="size-3.5" />
								{priceLabel}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">{m.items_price_menu_label()}</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => setPricePreset('all')}>
								<Check className={cn('size-4', pricePreset !== 'all' && 'opacity-0')} />
								{m.items_price_any_option()}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							{pricePresets.map(p => (
								<DropdownMenuItem key={p.id} onClick={() => setPricePreset(p.id)}>
									<Check className={cn('size-4', pricePreset !== p.id && 'opacity-0')} />
									{priceRangeLabel(p.min, p.max, money.roundAmount)}
								</DropdownMenuItem>
							))}
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setPricePreset('custom')} onSelect={e => e.preventDefault()}>
								<Check className={cn('size-4', pricePreset !== 'custom' && 'opacity-0')} />
								{m.items_price_custom()}
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
										placeholder={m.items_price_min_placeholder()}
										value={customMin}
										onChange={e => setCustomMin(e.target.value)}
										className="h-7 w-20 text-xs"
									/>
									<span className="text-xs text-muted-foreground">–</span>
									<Input
										type="number"
										inputMode="decimal"
										min={0}
										placeholder={m.items_price_max_placeholder()}
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
							<Button variant="outline" size="xs" className="text-muted-foreground">
								<ArrowUpDown className="size-3.5" />
								{sortLabel(sort)}
								<SortDirectionIcon className="size-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
								{m.items_sort_by_priority_label()}
							</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => setSort('priority-desc')}>
								<Check className={cn('size-4', sort !== 'priority-desc' && 'opacity-0')} />
								{m.items_sort_high_to_low()}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setSort('priority-asc')}>
								<Check className={cn('size-4', sort !== 'priority-asc' && 'opacity-0')} />
								{m.items_sort_low_to_high()}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">{m.items_sort_by_date_label()}</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => setSort('date-desc')}>
								<Check className={cn('size-4', sort !== 'date-desc' && 'opacity-0')} />
								{m.items_sort_newest_first()}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setSort('date-asc')}>
								<Check className={cn('size-4', sort !== 'date-asc' && 'opacity-0')} />
								{m.items_sort_oldest_first()}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{/* With categories, the overview panel sits beside the list once the
				    page is wide enough (a rem container query, so it follows the text
				    size). Narrower than that, and on a phone, the panel is not shown. */}
				<div
					className={cn(
						hasCategorized &&
							'@min-[58rem]/page:grid @min-[58rem]/page:grid-cols-[minmax(0,1fr)_17rem] @min-[58rem]/page:items-start @min-[58rem]/page:gap-6'
					)}
				>
					<div className="flex min-w-0 flex-col gap-2">
						{activeNarrow !== null && (
							<div className="flex items-center gap-2 text-sm text-muted-foreground xs:pl-6">
								<span className="min-w-0 truncate">
									{m.items_overview_showing({ name: categorySections.find(s => s.key === activeNarrow)?.name ?? '' })}
								</span>
								<Button variant="outline" size="xs" onClick={() => setNarrowTo(null)}>
									{m.items_overview_show_all()}
								</Button>
							</div>
						)}
						{shownEntries.length === 0 ? (
							<EmptyMessage message={m.items_empty_filtered()} className="xs:ml-6" />
						) : arrangement === 'category' && hasCategorized ? (
							categorySections.map(section => {
								const rows = shownEntries.filter(e => categoryKeyOfEntry(e, knownCategoryIds) === section.key)
								if (rows.length === 0) return null
								const stats = claimStats.get(section.key) ?? { total: rows.length, claimed: 0 }
								return (
									<section key={`category-${section.key}`} className="flex flex-col gap-2 not-first:mt-3">
										<div className="flex items-center gap-2 border-b pb-1.5 xs:ml-6">
											<div role="heading" aria-level={2} className="truncate font-bold leading-tight">
												{section.name}
											</div>
											<span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">{stats.total}</span>
											<span className="flex-1" />
											<ClaimMeter total={stats.total} claimed={stats.claimed} className="w-14 shrink-0" />
											<span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
												{m.items_category_claimed_count({ claimed: stats.claimed, total: stats.total })}
											</span>
										</div>
										{rows.map(renderEntry)}
									</section>
								)
							})
						) : (
							shownEntries.map(renderEntry)
						)}
					</div>
					{hasCategorized && (
						<CategoryOverview
							rows={overviewRows}
							selected={activeNarrow}
							onSelect={setNarrowTo}
							className="sticky top-4 hidden @min-[58rem]/page:flex"
						/>
					)}
				</div>
			</div>
		</InternalListLinksProvider>
	)
}
