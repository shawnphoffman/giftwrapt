import { format, startOfMonth } from 'date-fns'
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, ExternalLink, Gift, Info, Package, Pencil, Receipt, Users, Zap } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import type { SummaryItem } from '@/api/purchases'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
import { type EditablePurchase, PurchaseEditDialog } from '@/components/purchases/purchase-edit-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type PersonGroup, groupByPerson } from '@/lib/purchases-grouping'

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
}

type Timeframe = '30d' | '60d' | '6m' | '12m' | 'all'

const TIMEFRAME_OPTIONS: Array<{ value: Timeframe; label: string }> = [
	{ value: '30d', label: 'Last 30 days' },
	{ value: '60d', label: 'Last 60 days' },
	{ value: '6m', label: 'Last 6 months' },
	{ value: '12m', label: 'Last 12 months' },
	{ value: 'all', label: 'All time' },
]

function timeframeCutoff(tf: Timeframe): Date | null {
	if (tf === 'all') return null
	const now = Date.now()
	switch (tf) {
		case '30d':
			return new Date(now - 30 * 24 * 60 * 60 * 1000)
		case '60d':
			return new Date(now - 60 * 24 * 60 * 60 * 1000)
		case '6m': {
			const d = new Date()
			d.setMonth(d.getMonth() - 6)
			return d
		}
		case '12m': {
			const d = new Date()
			d.setFullYear(d.getFullYear() - 1)
			return d
		}
	}
}

function fmt(n: number): string {
	return n.toFixed(2)
}

const chartConfig = {
	gifts: { label: 'Gifts', color: 'var(--color-green-600)' },
	addons: { label: 'Addons', color: 'var(--color-orange-500)' },
} satisfies ChartConfig

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

export function PurchasesPageContent({ items }: Props) {
	const [timeframe, setTimeframe] = useState<Timeframe>('6m')
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

	const filtered = useMemo(() => {
		const cutoff = timeframeCutoff(timeframe)
		if (!cutoff) return items
		return items.filter(i => new Date(i.createdAt) >= cutoff)
	}, [items, timeframe])

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
		const avgSpendPerGift = itemsWithCost.length > 0 ? itemsWithCost.reduce((s, i) => s + (i.cost ?? 0), 0) / itemsWithCost.length : 0
		const maxSpend = itemsWithCost.reduce((m, i) => Math.max(m, i.cost ?? 0), 0)

		const totalPeople = groups.length
		const peopleWithSpend = groups.filter(g => g.totalSpent > 0).length
		const avgSpendPerPerson = peopleWithSpend > 0 ? totalSpend / peopleWithSpend : 0
		const avgGiftsPerPerson = totalPeople > 0 ? totalItems / totalPeople : 0

		const topGroup: PersonGroup | null = groups.length > 0 && groups[0]!.totalSpent > 0 ? groups[0]! : null

		return {
			totalGifts,
			totalAddons,
			totalItems,
			giftsTotalSpend,
			addonsTotalSpend,
			totalSpend,
			avgSpendPerGift,
			maxSpend,
			totalPeople,
			peopleWithSpend,
			avgSpendPerPerson,
			avgGiftsPerPerson,
			topGroup,
		}
	}, [filtered, groups])

	return (
		<div className="wish-page max-w-6xl">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Purchases</h1>
					<Receipt className="text-pink-500 wish-page-icon" />
				</div>

				<p className="text-sm text-muted-foreground">
					All of your purchases and addons over time. If you have a partner, their purchases appear here too (excluding gifts for you). Edit
					any row to record pricing and notes, which stay private to you.
				</p>

				{/* CONTROLS */}
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<span className="text-sm text-muted-foreground">Timeframe:</span>
						<Select value={timeframe} onValueChange={v => setTimeframe(v as Timeframe)}>
							<SelectTrigger className="w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TIMEFRAME_OPTIONS.map(opt => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
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
						{/* METRICS + CHART */}
						<div className="grid grid-cols-1 @4xl/page:grid-cols-[1fr_1.1fr] gap-4">
							<div className="flex flex-col gap-4">
								<MetricsGroup title="Totals">
									<Metric label="Total Spend" value={<MoneyChip amount={metrics.totalSpend} variant="green" />} />
									<Metric label="Gifts Spend" value={<MoneyChip amount={metrics.giftsTotalSpend} variant="green" />} />
									<Metric label="Addons Spend" value={<MoneyChip amount={metrics.addonsTotalSpend} variant="orange" />} />
									<Metric
										label="Total Items"
										tooltip="On-list gifts / off-list addons"
										value={
											<span className="text-base font-semibold tabular-nums">
												{metrics.totalItems}{' '}
												<span className="text-xs text-muted-foreground font-normal">
													({metrics.totalGifts} / {metrics.totalAddons})
												</span>
											</span>
										}
									/>
								</MetricsGroup>

								<MetricsGroup title="Averages">
									<Metric label="Per Gift (excl. $0)" value={<MoneyChip amount={metrics.avgSpendPerGift} variant="green" />} />
									<Metric label="Per Person" value={<MoneyChip amount={metrics.avgSpendPerPerson} variant="green" />} />
									<Metric
										label="Gifts/Person"
										value={<span className="text-base font-semibold tabular-nums">{metrics.avgGiftsPerPerson.toFixed(1)}</span>}
									/>
									<Metric label="Max Single Gift" value={<MoneyChip amount={metrics.maxSpend} variant="green" />} />
								</MetricsGroup>

								<MetricsGroup title="People">
									<Metric
										label="Recipients"
										tooltip="Total / recipients with at least one priced item"
										value={
											<span className="text-base font-semibold tabular-nums">
												{metrics.totalPeople} / {metrics.peopleWithSpend}
											</span>
										}
									/>
									<Metric
										label="Top Recipient"
										value={
											metrics.topGroup ? (
												<div className="flex items-center gap-2 min-w-0">
													<UserAvatar name={metrics.topGroup.name} image={metrics.topGroup.image} size="small" />
													<span className="truncate text-sm font-medium">{metrics.topGroup.name}</span>
													<MoneyChip amount={metrics.topGroup.totalSpent} variant="green" />
												</div>
											) : (
												<span className="text-sm text-muted-foreground">—</span>
											)
										}
									/>
								</MetricsGroup>
							</div>

							<div className="flex flex-col gap-2 p-4 border rounded-lg bg-accent min-w-0">
								<div className="text-base font-semibold">Spend Over Time</div>
								<div className="text-xs text-muted-foreground">Per month, stacked by gift vs. addon.</div>
								{monthly.length > 0 ? (
									<ChartContainer config={chartConfig} className="aspect-auto h-52 w-full">
										<BarChart accessibilityLayer data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
											<CartesianGrid vertical={false} />
											<XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
											<YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} tickFormatter={v => `$${v}`} />
											<ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
											<Bar dataKey="gifts" stackId="a" fill="var(--color-gifts)" radius={[0, 0, 0, 0]} />
											<Bar dataKey="addons" stackId="a" fill="var(--color-addons)" radius={[4, 4, 0, 0]} />
										</BarChart>
									</ChartContainer>
								) : (
									<div className="text-sm text-muted-foreground py-6 text-center">No data.</div>
								)}
							</div>
						</div>

						{/* PER-PERSON BREAKDOWN */}
						<div className="overflow-hidden border rounded-lg bg-accent">
							<Table>
								<TableHeader>
									<TableRow className="hover:bg-transparent">
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
																	{g.partnerName && <span className="text-xs text-muted-foreground truncate">& {g.partnerName}</span>}
																</div>
																<span className="text-xs text-muted-foreground">
																	{purchaseCount} {purchaseCount === 1 ? 'purchase' : 'purchases'}
																</span>
															</div>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<MoneyChip amount={g.giftsTotal} variant="green" />
													</TableCell>
													<TableCell className="text-right">
														<MoneyChip amount={g.addonsTotal} variant="orange" />
													</TableCell>
													<TableCell className="text-right">
														<MoneyChip amount={g.totalSpent} variant="green" />
													</TableCell>
													<TableCell className="pr-3 text-muted-foreground">
														<ChevronDown className={`size-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
													</TableCell>
												</TableRow>
												{isOpen && (
													<TableRow className="hover:bg-transparent">
														<TableCell colSpan={5} className="p-0">
															<div className="divide-y bg-background/40">
																{g.items.map((item, i) => (
																	<PurchaseDetailRow key={`${g.key}-${i}`} item={item} onEdit={() => openEdit(item)} />
																))}
															</div>
														</TableCell>
													</TableRow>
												)}
											</Fragment>
										)
									})}
								</TableBody>
								<TableFooter>
									<TableRow className="hover:bg-transparent">
										<TableCell className="pl-3 font-semibold">Total</TableCell>
										<TableCell className="text-right">
											<MoneyChip amount={metrics.giftsTotalSpend} variant="green" />
										</TableCell>
										<TableCell className="text-right">
											<MoneyChip amount={metrics.addonsTotalSpend} variant="orange" />
										</TableCell>
										<TableCell className="text-right">
											<MoneyChip amount={metrics.totalSpend} variant="green" />
										</TableCell>
										<TableCell className="pr-3"></TableCell>
									</TableRow>
								</TableFooter>
							</Table>
						</div>
					</>
				)}
			</div>

			<PurchaseEditDialog open={dialogOpen} onOpenChange={handleDialogChange} purchase={editing} />
		</div>
	)
}

function PurchaseDetailRow({ item, onEdit }: { item: SummaryItem; onEdit: () => void }) {
	const hasNotes = !!item.notes
	const editable = item.isOwn && !item.isCoGifter

	return (
		<div className="flex items-start gap-3 px-3 py-2.5">
			{item.type === 'claim' ? (
				<Gift className="size-4 text-muted-foreground shrink-0 mt-0.5" />
			) : (
				<Package className="size-4 text-muted-foreground shrink-0 mt-0.5" />
			)}
			{hasNotes && <Zap className="size-4 text-yellow-500 shrink-0 fill-yellow-500 mt-0.5" />}
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
				<div className="text-xs text-muted-foreground truncate">{item.listName}</div>
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
			<Badge variant="default" className="text-xs tabular-nums shrink-0">
				{format(new Date(item.createdAt), 'MMM d')}
			</Badge>
			{editable ? (
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0 text-yellow-600 hover:text-yellow-500"
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

function MetricsGroup({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-3 p-4 border rounded-lg bg-accent">
			<div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
			<div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
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

function MoneyChip({ amount, variant }: { amount: number; variant: 'green' | 'orange' | 'muted' }) {
	const zero = amount === 0
	const classes = zero
		? 'bg-muted/50 text-muted-foreground'
		: variant === 'green'
			? 'bg-green-600 text-white'
			: variant === 'orange'
				? 'bg-orange-500 text-white'
				: 'bg-muted text-foreground'
	return (
		<span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${classes}`}>
			${fmt(amount)}
		</span>
	)
}
