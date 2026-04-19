import { Link } from '@tanstack/react-router'
import { ChevronDown, Gift, Info, Package, Pencil, ReceiptText, Users } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'

import type { SummaryItem } from '@/api/purchases'
import UserAvatar from '@/components/common/user-avatar'
import { type EditablePurchase, PurchaseEditDialog } from '@/components/purchases/purchase-edit-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { groupByPerson } from '@/lib/purchases-grouping'

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

export function PurchasesSummaryContent({ items }: Props) {
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

	const metrics = useMemo(() => {
		const totalGifts = filtered.filter(i => i.type === 'claim').length
		const totalAddons = filtered.filter(i => i.type === 'addon').length
		const totalItems = totalGifts + totalAddons

		const giftsTotalSpend = filtered.reduce((s, i) => s + (i.type === 'claim' ? i.cost ?? 0 : 0), 0)
		const addonsTotalSpend = filtered.reduce((s, i) => s + (i.type === 'addon' ? i.cost ?? 0 : 0), 0)
		const totalSpend = giftsTotalSpend + addonsTotalSpend

		const itemsWithCost = filtered.filter(i => (i.cost ?? 0) > 0)
		const avgSpendPerGift = itemsWithCost.length > 0 ? itemsWithCost.reduce((s, i) => s + (i.cost ?? 0), 0) / itemsWithCost.length : 0

		const totalPeople = groups.length
		const peopleWithSpend = groups.filter(g => g.totalSpent > 0).length
		const avgSpendPerPerson = peopleWithSpend > 0 ? totalSpend / peopleWithSpend : 0
		const avgGiftsPerPerson = totalPeople > 0 ? totalItems / totalPeople : 0

		return {
			totalGifts,
			totalAddons,
			totalItems,
			giftsTotalSpend,
			addonsTotalSpend,
			totalSpend,
			avgSpendPerGift,
			totalPeople,
			peopleWithSpend,
			avgSpendPerPerson,
			avgGiftsPerPerson,
		}
	}, [filtered, groups])

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Purchase Summary</h1>
					<ReceiptText className="text-orange-500 wish-page-icon" />
				</div>

				<p className="text-sm text-muted-foreground">
					This page summarizes your purchases and addons for a given timeframe. You can add gift price information on the{' '}
					<Link to="/purchases" className="text-primary hover:underline">
						My Purchases
					</Link>{' '}
					page.
				</p>

				{/* TIMEFRAME */}
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

				{filtered.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						No purchases in this timeframe.
					</div>
				) : (
					<>
						{/* SUMMARY METRICS */}
						<div className="border rounded-lg bg-accent p-4 flex flex-col gap-4">
							<div className="text-base font-semibold">Summary Metrics</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
								<Metric
									label="Average Spend/Gift (excl. $0)"
									value={<MoneyChip amount={metrics.avgSpendPerGift} variant="green" />}
								/>
								<Metric
									label="Average Spend/Person"
									value={<MoneyChip amount={metrics.avgSpendPerPerson} variant="green" />}
								/>
								<Metric
									label="Total People"
									tooltip="Total unique recipients / recipients with at least one priced item"
									value={<span className="text-lg font-semibold tabular-nums">{metrics.totalPeople} / {metrics.peopleWithSpend}</span>}
								/>
								<Metric
									label="Total Gifts"
									tooltip="Total items (on-list gifts / off-list addons)"
									value={
										<span className="text-lg font-semibold tabular-nums">
											{metrics.totalItems} <span className="text-sm text-muted-foreground">({metrics.totalGifts} / {metrics.totalAddons})</span>
										</span>
									}
								/>
								<Metric
									label="Avg Gifts/Person"
									value={<span className="text-lg font-semibold tabular-nums">{metrics.avgGiftsPerPerson.toFixed(1)}</span>}
								/>
								<Metric
									label="Total Spend"
									value={<MoneyChip amount={metrics.totalSpend} variant="green" />}
								/>
								<Metric
									label="Gifts Total Spend"
									value={<MoneyChip amount={metrics.giftsTotalSpend} variant="green" />}
								/>
								<Metric
									label="Addons Total Spend"
									value={<MoneyChip amount={metrics.addonsTotalSpend} variant="orange" />}
								/>
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
												<TableRow
													className="cursor-pointer"
													data-state={isOpen ? 'open' : 'closed'}
													onClick={() => toggleOpen(g.key)}
												>
													<TableCell className="pl-3 py-2">
														<div className="flex items-center gap-3 min-w-0">
															<UserAvatar name={g.name} image={g.image} size="medium" />
															<div className="flex flex-col min-w-0">
																<div className="flex items-center gap-2 min-w-0">
																	<span className="font-medium truncate">{g.name}</span>
																	{g.partnerName && (
																		<span className="text-xs text-muted-foreground truncate">& {g.partnerName}</span>
																	)}
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
														<ChevronDown
															className={`size-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
														/>
													</TableCell>
												</TableRow>
												{isOpen && (
													<TableRow className="hover:bg-transparent">
														<TableCell colSpan={5} className="p-0">
															<div className="divide-y bg-background/40">
																{g.items.map((item, i) => (
																	<div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
																		{item.type === 'claim' ? (
																			<Gift className="size-3.5 text-muted-foreground shrink-0" />
																		) : (
																			<Package className="size-3.5 text-muted-foreground shrink-0" />
																		)}
																		<span className="flex-1 truncate">{item.title}</span>
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
																		<span className="text-xs text-muted-foreground shrink-0">{item.listName}</span>
																		{item.quantity > 1 && (
																			<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
																				x{item.quantity}
																			</Badge>
																		)}
																		{item.cost != null && (
																			<span className="tabular-nums text-xs shrink-0">${fmt(item.cost)}</span>
																		)}
																		{item.isOwn && !item.isCoGifter && (
																			<Button
																				variant="ghost"
																				size="icon"
																				className="size-6 shrink-0 text-yellow-600 hover:text-yellow-500"
																				onClick={e => {
																					e.stopPropagation()
																					openEdit(item)
																				}}
																				aria-label="Edit purchase details"
																			>
																				<Pencil className="size-3.5" />
																			</Button>
																		)}
																	</div>
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

function Metric({ label, value, tooltip }: { label: string; value: React.ReactNode; tooltip?: string }) {
	return (
		<div className="flex flex-col gap-1">
			<div className="text-sm text-muted-foreground flex items-center gap-1">
				<span>{label}</span>
				{tooltip && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Info className="size-3.5 text-muted-foreground cursor-help" />
						</TooltipTrigger>
						<TooltipContent>{tooltip}</TooltipContent>
					</Tooltip>
				)}
			</div>
			<div>{value}</div>
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

