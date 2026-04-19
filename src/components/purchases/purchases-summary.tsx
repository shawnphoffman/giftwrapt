import { Link } from '@tanstack/react-router'
import { ChevronDown, Gift, Info, Package, ReceiptText } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { SummaryItem } from '@/api/purchases'
import UserAvatar from '@/components/common/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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

type PersonGroup = {
	key: string
	name: string
	email: string
	image: string | null
	partnerName: string | null
	items: Array<SummaryItem>
	claimCount: number
	addonCount: number
	giftsTotal: number
	addonsTotal: number
	totalSpent: number
}

function groupByPerson(items: Array<SummaryItem>): Array<PersonGroup> {
	const map = new Map<string, PersonGroup>()

	function getKey(ownerId: string, ownerPartnerId: string | null): string {
		if (ownerPartnerId && map.has(ownerPartnerId)) return ownerPartnerId
		return ownerId
	}

	function ensure(item: SummaryItem): PersonGroup {
		const key = getKey(item.ownerId, item.ownerPartnerId)
		let group = map.get(key)
		if (!group) {
			group = {
				key: item.ownerId,
				name: item.ownerName || item.ownerEmail,
				email: item.ownerEmail,
				image: item.ownerImage,
				partnerName: null,
				items: [],
				claimCount: 0,
				addonCount: 0,
				giftsTotal: 0,
				addonsTotal: 0,
				totalSpent: 0,
			}
			map.set(item.ownerId, group)
		} else if (key !== item.ownerId && !group.partnerName) {
			group.partnerName = item.ownerName || item.ownerEmail
		}
		return group
	}

	for (const item of items) {
		const group = ensure(item)
		group.items.push(item)
		const cost = item.cost ?? 0
		if (item.type === 'claim') {
			group.claimCount++
			group.giftsTotal += cost
		} else {
			group.addonCount++
			group.addonsTotal += cost
		}
		group.totalSpent += cost
	}

	return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent)
}

function fmt(n: number): string {
	return n.toFixed(2)
}

export function PurchasesSummaryContent({ items }: Props) {
	const [timeframe, setTimeframe] = useState<Timeframe>('6m')

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
					<div className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-accent">
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
						<div className="flex flex-col overflow-hidden border rounded-lg bg-accent divide-y">
							{groups.map(g => (
								<PersonCard key={g.key} group={g} />
							))}
							<div className="flex items-center justify-between gap-2 px-3 py-3 bg-muted/30">
								<span className="font-semibold">Total</span>
								<div className="flex items-center gap-2">
									<MoneyChip amount={metrics.giftsTotalSpend} variant="green" />
									<MoneyChip amount={metrics.addonsTotalSpend} variant="orange" />
									<span className="text-muted-foreground">|</span>
									<MoneyChip amount={metrics.totalSpend} variant="green" />
								</div>
							</div>
						</div>
					</>
				)}

				<div className="text-sm text-muted-foreground">
					<Link to="/purchases" className="hover:underline">
						&larr; View all purchases
					</Link>
				</div>
			</div>
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

function PersonCard({ group }: { group: PersonGroup }) {
	const displayName = group.name
	const purchaseCount = group.claimCount + group.addonCount

	return (
		<Collapsible>
			<div className="overflow-hidden">
				<CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 text-left gap-3">
					<div className="flex items-center gap-3 min-w-0">
						<UserAvatar name={displayName} image={group.image} size="medium" />
						<div className="flex flex-col min-w-0">
							<div className="flex items-center gap-2 min-w-0">
								<span className="font-medium truncate">{displayName}</span>
								{group.partnerName && (
									<span className="text-xs text-muted-foreground truncate">& {group.partnerName}</span>
								)}
							</div>
							<span className="text-xs text-muted-foreground">
								{purchaseCount} {purchaseCount === 1 ? 'purchase' : 'purchases'}
							</span>
						</div>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						<MoneyChip amount={group.giftsTotal} variant="green" />
						<MoneyChip amount={group.addonsTotal} variant="orange" />
						<span className="text-muted-foreground">|</span>
						<MoneyChip amount={group.totalSpent} variant="green" />
						<ChevronDown className="size-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
					</div>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="divide-y border-t">
						{group.items.map((item, i) => (
							<div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
								{item.type === 'claim' ? (
									<Gift className="size-3.5 text-muted-foreground shrink-0" />
								) : (
									<Package className="size-3.5 text-muted-foreground shrink-0" />
								)}
								<span className="flex-1 truncate">{item.title}</span>
								<span className="text-xs text-muted-foreground shrink-0">{item.listName}</span>
								{item.quantity > 1 && (
									<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
										x{item.quantity}
									</Badge>
								)}
								{item.cost != null && (
									<span className="tabular-nums text-xs shrink-0">${fmt(item.cost)}</span>
								)}
							</div>
						))}
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	)
}
