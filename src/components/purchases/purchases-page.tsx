import { format, startOfMonth } from 'date-fns'
import {
	ChevronDown,
	ChevronsDownUp,
	ChevronsUpDown,
	ExternalLink,
	Gift,
	Info,
	PackagePlus,
	Pencil,
	Receipt,
	Users,
	Zap,
} from 'lucide-react'
import { Fragment, lazy, Suspense, useMemo, useState } from 'react'

import type { SummaryItem } from '@/api/purchases'
import { DateRangeFilter } from '@/components/common/date-range-filter'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import { PageHeading } from '@/components/common/page-heading'
import UserAvatar from '@/components/common/user-avatar'
import { PurchasesOrphanSummary } from '@/components/orphan-claims/purchases-orphan-summary'
import { type EditablePurchase, PurchaseEditDialog } from '@/components/purchases/purchase-edit-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// recharts is ~350 KB. The chart cards only render once spend data is
// summarised, so paying that cost up front for every /purchases visit
// (especially for empty / first-time users) is wasteful. Pull the chart
// island in lazily so the page paints first, then hydrates the charts.
const SpendByRecipientChart = lazy(() => import('./purchases-charts').then(m => ({ default: m.SpendByRecipientChart })))
const SpendOverTimeChart = lazy(() => import('./purchases-charts').then(m => ({ default: m.SpendOverTimeChart })))
const ChartCardFallback = () => (
	<CardContent>
		<Skeleton className="h-60 w-full" />
	</CardContent>
)
import { groupByPerson, type PersonGroup } from '@/lib/purchases-grouping'
import { matchesTimeframe, type TimeframeValue } from '@/lib/timeframe'

import { Separator } from '../ui/separator'

function toEditable(item: SummaryItem): EditablePurchase | null {
	// Co-gifter claims aren't editable until we have UI for per-gifter spend.
	if (item.isCoGifter) return null
	if (item.type === 'claim' && item.giftId != null) {
		return {
			type: 'claim',
			giftId: item.giftId,
			quantity: item.quantity,
			totalCost: item.totalCostRaw,
			notes: item.notes,
		}
	}
	if (item.type === 'addon' && item.addonId != null) {
		return {
			type: 'addon',
			addonId: item.addonId,
			totalCost: item.totalCostRaw,
			notes: item.notes,
		}
	}
	return null
}

type Props = {
	items: Array<SummaryItem>
	partner: { name: string; image: string | null } | null
}

function fmt(n: number): string {
	return n.toFixed(2)
}

type MonthBucket = { month: string; gifts: number; addons: number }

function buildMonthlyBuckets(items: Array<SummaryItem>): Array<MonthBucket> {
	if (items.length === 0) return []
	const map = new Map<string, MonthBucket>()
	let minTime = Infinity
	let maxTime = -Infinity
	for (const item of items) {
		const d = startOfMonth(new Date(item.createdAt))
		const key = d.toISOString()
		if (d.getTime() < minTime) minTime = d.getTime()
		if (d.getTime() > maxTime) maxTime = d.getTime()
		let bucket = map.get(key)
		if (!bucket) {
			bucket = { month: format(d, 'MMM yy'), gifts: 0, addons: 0 }
			map.set(key, bucket)
		}
		const cost = item.cost ?? 0
		if (item.type === 'claim') bucket.gifts += cost
		else bucket.addons += cost
	}
	// Fill gaps so the x-axis reads continuously.
	const result: Array<MonthBucket> = []
	const cursor = new Date(minTime)
	const end = new Date(maxTime)
	while (cursor.getTime() <= end.getTime()) {
		const key = cursor.toISOString()
		result.push(map.get(key) ?? { month: format(cursor, 'MMM yy'), gifts: 0, addons: 0 })
		cursor.setMonth(cursor.getMonth() + 1)
	}
	return result
}

export function PurchasesPageContent({ items, partner }: Props) {
	const [timeframe, setTimeframe] = useState<TimeframeValue>({ kind: 'preset', preset: '6m' })
	const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())
	const [editing, setEditing] = useState<EditablePurchase | null>(null)
	const [dialogOpen, setDialogOpen] = useState(false)

	function openEdit(item: SummaryItem) {
		const editable = toEditable(item)
		if (!editable) return
		setEditing(editable)
		setDialogOpen(true)
	}

	function handleDialogChange(open: boolean) {
		setDialogOpen(open)
		if (!open) setEditing(null)
	}

	function toggleOpen(key: string) {
		setOpenKeys(prev => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}

	const filtered = useMemo(() => items.filter(i => matchesTimeframe(i.createdAt, timeframe)), [items, timeframe])

	const groups = useMemo(() => groupByPerson(filtered), [filtered])
	const monthly = useMemo(() => buildMonthlyBuckets(filtered), [filtered])

	const allOpen = groups.length > 0 && openKeys.size === groups.length
	function toggleAll() {
		if (allOpen) setOpenKeys(new Set())
		else setOpenKeys(new Set(groups.map(g => g.key)))
	}

	const metrics = useMemo(() => {
		const totalGifts = filtered.filter(i => i.type === 'claim').length
		const totalAddons = filtered.filter(i => i.type === 'addon').length
		const totalItems = totalGifts + totalAddons

		const giftsTotalSpend = filtered.reduce((s, i) => s + (i.type === 'claim' ? (i.cost ?? 0) : 0), 0)
		const addonsTotalSpend = filtered.reduce((s, i) => s + (i.type === 'addon' ? (i.cost ?? 0) : 0), 0)
		const totalSpend = giftsTotalSpend + addonsTotalSpend

		const itemsWithCost = filtered.filter(i => (i.cost ?? 0) > 0)
		const perItem = totalItems > 0 ? totalSpend / totalItems : 0
		const perItemExclZero = itemsWithCost.length > 0 ? itemsWithCost.reduce((s, i) => s + (i.cost ?? 0), 0) / itemsWithCost.length : 0
		const maxSpend = itemsWithCost.reduce((m, i) => Math.max(m, i.cost ?? 0), 0)

		const totalPeople = groups.length
		const peopleWithSpend = groups.filter(g => g.totalSpent > 0).length
		const itemsPerPerson = totalPeople > 0 ? totalItems / totalPeople : 0
		const itemsPerPersonExclZero = peopleWithSpend > 0 ? itemsWithCost.length / peopleWithSpend : 0

		// Groups are pre-sorted by totalSpent desc. Top is the first with spend;
		// bottom is the last with spend (so we don't surface zero-spend rows).
		const spendingGroups = groups.filter(g => g.totalSpent > 0)
		const topGroup: PersonGroup | null = spendingGroups[0] ?? null
		const bottomGroup: PersonGroup | null = spendingGroups.length > 0 ? spendingGroups[spendingGroups.length - 1] : null

		return {
			totalGifts,
			totalAddons,
			totalItems,
			giftsTotalSpend,
			addonsTotalSpend,
			totalSpend,
			perItem,
			perItemExclZero,
			maxSpend,
			totalPeople,
			peopleWithSpend,
			itemsPerPerson,
			itemsPerPersonExclZero,
			topGroup,
			bottomGroup,
		}
	}, [filtered, groups])

	const recipientChartData = useMemo(
		() =>
			groups.map(g => ({
				name: g.name,
				gifts: g.giftsTotal,
				addons: g.addonsTotal,
			})),
		[groups]
	)

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<PageHeading title="Purchases" icon={Receipt} color="cyan" />

				<p className="text-sm text-muted-foreground">
					All of your purchases and addons over time. If you have a partner, their purchases appear here too (excluding gifts for you). Edit
					any row to record pricing and notes, which stay private to you.
				</p>

				<PurchasesOrphanSummary />

				{/* CONTROLS */}
				<div className="flex flex-wrap items-center justify-between gap-3">
					<DateRangeFilter value={timeframe} onChange={setTimeframe} />
					{groups.length > 0 && (
						<Button variant="outline" size="sm" onClick={toggleAll}>
							{allOpen ? (
								<>
									<ChevronsDownUp className="size-4" /> Collapse all
								</>
							) : (
								<>
									<ChevronsUpDown className="size-4" /> Expand all
								</>
							)}
						</Button>
					)}
				</div>

				{filtered.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						No purchases in this timeframe.
					</div>
				) : (
					<>
						{/* PER-PERSON BREAKDOWN */}
						<div className="overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-foreground/10">
							<Table>
								<TableHeader className="bg-muted">
									<TableRow>
										<TableHead className="pl-3">Person</TableHead>
										<TableHead className="text-right">Gifts</TableHead>
										<TableHead className="text-right">Addons</TableHead>
										<TableHead className="text-right">Total</TableHead>
										<TableHead className="w-8 pr-3"></TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{groups.map(g => {
										const isOpen = openKeys.has(g.key)
										const purchaseCount = g.claimCount + g.addonCount
										return (
											<Fragment key={g.key}>
												<TableRow className="cursor-pointer" data-state={isOpen ? 'open' : 'closed'} onClick={() => toggleOpen(g.key)}>
													<TableCell className="pl-3 py-2">
														<div className="flex items-center gap-3 min-w-0">
															<UserAvatar name={g.name} image={g.image} size="medium" />
															<div className="flex flex-col min-w-0">
																<div className="flex items-center gap-2 min-w-0">
																	<span className="font-medium truncate">{g.name}</span>
																</div>
																<span className="text-xs text-muted-foreground">
																	{purchaseCount} {purchaseCount === 1 ? 'purchase' : 'purchases'}
																</span>
															</div>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<MoneyChip amount={g.giftsTotal} variant="gifts" />
													</TableCell>
													<TableCell className="text-right">
														<MoneyChip amount={g.addonsTotal} variant="addons" />
													</TableCell>
													<TableCell className="text-right">
														<MoneyChip amount={g.totalSpent} variant="total" />
													</TableCell>
													<TableCell className="pr-3 text-muted-foreground">
														<ChevronDown className={`size-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
													</TableCell>
												</TableRow>
												<TableRow className="hover:bg-transparent border-0">
													<TableCell colSpan={5} className="p-0">
														<div
															className="grid transition-[grid-template-rows] duration-200 ease-out"
															style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
															aria-hidden={!isOpen}
														>
															<div className="overflow-hidden">
																<div className="divide-y border-b bg-muted/50">
																	{g.items.map((item, i) => (
																		<PurchaseDetailRow key={`${g.key}-${i}`} item={item} partner={partner} onEdit={() => openEdit(item)} />
																	))}
																</div>
															</div>
														</div>
													</TableCell>
												</TableRow>
											</Fragment>
										)
									})}
								</TableBody>
								<TableFooter className="bg-muted">
									<TableRow>
										<TableCell className="pl-3 font-semibold">Total</TableCell>
										<TableCell className="text-right">
											<MoneyChip amount={metrics.giftsTotalSpend} variant="gifts" />
										</TableCell>
										<TableCell className="text-right">
											<MoneyChip amount={metrics.addonsTotalSpend} variant="addons" />
										</TableCell>
										<TableCell className="text-right">
											<MoneyChip amount={metrics.totalSpend} variant="total" />
										</TableCell>
										<TableCell className="pr-3"></TableCell>
									</TableRow>
								</TableFooter>
							</Table>
						</div>

						<Separator />

						{/* METRICS + CHART (below the list) */}
						<div className="flex flex-col gap-4 **:data-[slot=card]:bg-linear-to-t **:data-[slot=card]:from-accent/50 **:data-[slot=card]:to-card dark:**:data-[slot=card]:bg-card">
							<div className="grid grid-cols-1 @md/page:grid-cols-2 @4xl/page:grid-cols-3 gap-4">
								<MetricsGroup title="Totals" cols={3}>
									<Metric label="Total Spend" value={<MoneyChip amount={metrics.totalSpend} variant="total" />} />
									<Metric label="Gifts" value={<MoneyChip amount={metrics.giftsTotalSpend} variant="gifts" />} />
									<Metric label="Addons" value={<MoneyChip amount={metrics.addonsTotalSpend} variant="addons" />} />
									<Metric label="Total Items" value={<span className="text-base font-semibold tabular-nums">{metrics.totalItems}</span>} />
									<Metric label="Gifts" value={<span className="text-base font-semibold tabular-nums">{metrics.totalGifts}</span>} />
									<Metric label="Addons" value={<span className="text-base font-semibold tabular-nums">{metrics.totalAddons}</span>} />
								</MetricsGroup>

								<MetricsGroup title="Averages">
									<Metric label="Per Item" value={<MoneyChip amount={metrics.perItem} variant="total" />} />
									<Metric label="Per Item (excl. $0)" value={<MoneyChip amount={metrics.perItemExclZero} variant="total" />} />
									<Metric
										label="Items/Person"
										value={<span className="text-base font-semibold tabular-nums">{metrics.itemsPerPerson.toFixed(1)}</span>}
									/>
									<Metric
										label="Items/Person (excl. $0)"
										value={<span className="text-base font-semibold tabular-nums">{metrics.itemsPerPersonExclZero.toFixed(1)}</span>}
									/>
								</MetricsGroup>

								<MetricsGroup title="Highlights" className="@md/page:col-span-2 @4xl/page:col-span-1">
									<Metric label="Recipients" value={<span className="text-base font-semibold tabular-nums">{metrics.totalPeople}</span>} />
									<Metric label="Max Recipient" value={<PersonCell group={metrics.topGroup} />} />
									<Metric label="Max Single Item" value={<MoneyChip amount={metrics.maxSpend} variant="total" />} />
									<Metric label="Min Recipient" value={<PersonCell group={metrics.bottomGroup} />} />
								</MetricsGroup>
							</div>

							<div className="grid grid-cols-1 @4xl/page:grid-cols-2 gap-4">
								<Card size="sm" className="min-w-0">
									<CardHeader>
										<CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
											Spend by Recipient
										</CardTitle>
										<CardDescription>Per recipient, stacked by gift vs. addon.</CardDescription>
									</CardHeader>
									<Suspense fallback={<ChartCardFallback />}>
										<SpendByRecipientChart data={recipientChartData} />
									</Suspense>
								</Card>

								<Card size="sm" className="min-w-0">
									<CardHeader>
										<CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spend Over Time</CardTitle>
										<CardDescription>Per month, stacked by gift vs. addon.</CardDescription>
									</CardHeader>
									<Suspense fallback={<ChartCardFallback />}>
										<SpendOverTimeChart data={monthly} />
									</Suspense>
								</Card>
							</div>
						</div>
					</>
				)}
			</div>

			<PurchaseEditDialog open={dialogOpen} onOpenChange={handleDialogChange} purchase={editing} />
		</div>
	)
}

function PurchaseDetailRow({
	item,
	partner,
	onEdit,
}: {
	item: SummaryItem
	partner: { name: string; image: string | null } | null
	onEdit: () => void
}) {
	const hasNotes = !!item.notes
	const editable = item.isOwn && !item.isCoGifter
	const showPartner = item.isPartnerPurchase && partner !== null

	return (
		<div className="flex items-start gap-3 px-3 py-2.5">
			<div className="flex flex-col items-center gap-2 shrink-0 mt-0.5">
				{item.type === 'claim' ? (
					<Gift className="size-4 text-muted-foreground" />
				) : (
					<PackagePlus className="size-4 text-muted-foreground" />
				)}
				{hasNotes && <Zap className="size-4 text-yellow-500 fill-yellow-500" />}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-medium truncate">{item.title}</span>
					{item.itemUrl && (
						<a
							href={item.itemUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-muted-foreground hover:text-foreground shrink-0"
							onClick={e => e.stopPropagation()}
						>
							<ExternalLink className="size-3.5" />
						</a>
					)}
					{item.isCoGifter && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Badge variant="secondary" className="text-xs shrink-0 gap-1">
									<Users className="size-3" /> Co-gifter
								</Badge>
							</TooltipTrigger>
							<TooltipContent>Shown at $0 until per-gifter spend is captured.</TooltipContent>
						</Tooltip>
					)}
				</div>
				{hasNotes && <MarkdownNotes content={item.notes!} className="text-xs text-foreground/75 mt-0.5" />}
				<div className="flex items-center gap-1.5 min-w-0">
					{showPartner && (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="shrink-0" onClick={e => e.stopPropagation()}>
									<UserAvatar name={partner.name} image={partner.image} size="small" />
								</span>
							</TooltipTrigger>
							<TooltipContent>Claimed by your partner ({partner.name})</TooltipContent>
						</Tooltip>
					)}
					<div className="text-xs text-muted-foreground truncate">{item.listName}</div>
				</div>
			</div>
			{item.type === 'claim' && item.quantity > 1 && (
				<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
					x{item.quantity}
				</Badge>
			)}
			{item.type === 'addon' && (
				<Badge variant="secondary" className="text-xs shrink-0">
					Addon
				</Badge>
			)}
			{item.cost != null && item.cost > 0 && (
				<Badge variant="outline" className="text-xs tabular-nums shrink-0">
					${fmt(item.cost)}
				</Badge>
			)}
			<Badge variant="outline" className="text-xs tabular-nums shrink-0">
				{format(new Date(item.createdAt), 'MMM d')}
			</Badge>
			{editable ? (
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
					onClick={e => {
						e.stopPropagation()
						onEdit()
					}}
					aria-label="Edit purchase details"
				>
					<Pencil className="size-4" />
				</Button>
			) : (
				<div className="size-7 shrink-0" />
			)}
		</div>
	)
}

function MetricsGroup({
	title,
	cols = 2,
	className,
	children,
}: {
	title?: string
	cols?: 2 | 3
	className?: string
	children: React.ReactNode
}) {
	const gridCols = cols === 3 ? 'grid-cols-3' : 'grid-cols-2'
	return (
		<Card size="sm" className={className}>
			{title && (
				<CardHeader>
					<CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
				</CardHeader>
			)}
			<CardContent className={`grid ${gridCols} gap-x-4 gap-y-3`}>{children}</CardContent>
		</Card>
	)
}

function PersonCell({ group }: { group: PersonGroup | null }) {
	if (!group) return <span className="text-sm text-muted-foreground">-</span>
	return (
		<div className="flex items-center gap-2 min-w-0">
			<UserAvatar name={group.name} image={group.image} size="small" />
			<span className="truncate text-sm font-medium">{group.name}</span>
			<MoneyChip amount={group.totalSpent} variant="total" />
		</div>
	)
}

function Metric({ label, value, tooltip }: { label: string; value: React.ReactNode; tooltip?: string }) {
	return (
		<div className="flex flex-col gap-1 min-w-0">
			<div className="text-xs text-muted-foreground flex items-center gap-1">
				<span>{label}</span>
				{tooltip && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Info className="size-3 text-muted-foreground cursor-help" />
						</TooltipTrigger>
						<TooltipContent>{tooltip}</TooltipContent>
					</Tooltip>
				)}
			</div>
			<div className="min-w-0">{value}</div>
		</div>
	)
}

function MoneyChip({ amount, variant }: { amount: number; variant: 'total' | 'gifts' | 'addons' | 'muted' }) {
	const zero = amount === 0
	const classes = zero
		? 'bg-muted text-muted-foreground'
		: variant === 'total'
			? 'bg-pink-700 text-white'
			: variant === 'addons'
				? 'bg-violet-700 text-white'
				: variant === 'gifts'
					? 'bg-cyan-700 text-white'
					: 'bg-muted text-foreground'
	return (
		<span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${classes}`}>
			${fmt(amount)}
		</span>
	)
}
