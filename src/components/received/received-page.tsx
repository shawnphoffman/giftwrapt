import { format } from 'date-fns'
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Gift, PackageOpen, PackagePlus } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'

import type { GifterUnit, ReceivedGiftsResult } from '@/api/received'
import UserAvatar from '@/components/common/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupByGifterUnit, type ReceivedRow } from '@/lib/received-grouping'

type Props = {
	data: ReceivedGiftsResult
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

const SELF_RECIPIENT_KEY = '__self__'

export function ReceivedPageContent({ data }: Props) {
	// Flatten everything into one stream the client filters by recipient.
	const { selfRows, dependentRows } = useMemo(() => {
		const self: Array<ReceivedRow> = [...data.gifts, ...data.addons]
		const dep = new Map<string, Array<ReceivedRow>>()
		for (const section of data.dependents) {
			dep.set(section.dependent.id, [...section.gifts, ...section.addons])
		}
		return { selfRows: self, dependentRows: dep }
	}, [data])

	const dependentTabs = data.dependents.map(d => d.dependent)
	const hasSelf = selfRows.length > 0
	const hasDependents = dependentTabs.length > 0

	const [recipientKey, setRecipientKey] = useState<string>(() => {
		if (hasSelf) return SELF_RECIPIENT_KEY
		if (hasDependents) return dependentTabs[0].id
		return SELF_RECIPIENT_KEY
	})
	const [timeframe, setTimeframe] = useState<Timeframe>('12m')
	const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

	const activeRows: Array<ReceivedRow> = useMemo(() => {
		if (recipientKey === SELF_RECIPIENT_KEY) return selfRows
		return dependentRows.get(recipientKey) ?? []
	}, [recipientKey, selfRows, dependentRows])

	const filtered = useMemo(() => {
		const cutoff = timeframeCutoff(timeframe)
		if (!cutoff) return activeRows
		return activeRows.filter(r => new Date(r.createdAt) >= cutoff)
	}, [activeRows, timeframe])

	const groups = useMemo(() => groupByGifterUnit(filtered), [filtered])

	const allOpen = groups.length > 0 && openKeys.size === groups.length
	function toggleAll() {
		if (allOpen) setOpenKeys(new Set())
		else setOpenKeys(new Set(groups.map(g => g.key)))
	}
	function toggleOpen(key: string) {
		setOpenKeys(prev => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}

	const metrics = useMemo(() => {
		const totalGifts = filtered.filter(r => r.type === 'item').length
		const totalAddons = filtered.filter(r => r.type === 'addon').length
		const totalItems = totalGifts + totalAddons
		return { totalGifts, totalAddons, totalItems }
	}, [filtered])

	const totalReceived = selfRows.length + Array.from(dependentRows.values()).reduce((s, rs) => s + rs.length, 0)

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Received</h1>
					<PackageOpen className="text-cyan-500 wish-page-icon" />
				</div>

				<p className="text-sm text-muted-foreground">
					Gifts that have been archived on your lists. Once archived, you can see who gifted each item. Partnered gifters appear together as
					a single household.
				</p>

				{totalReceived === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						No received gifts yet. Items will appear here after they are archived.
					</div>
				) : (
					<>
						{/* CONTROLS */}
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-2 flex-wrap">
								{hasDependents && (
									<>
										<span className="text-sm text-muted-foreground">Recipient:</span>
										<Select value={recipientKey} onValueChange={setRecipientKey}>
											<SelectTrigger className="w-[180px]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{hasSelf && <SelectItem value={SELF_RECIPIENT_KEY}>You</SelectItem>}
												{dependentTabs.map(d => (
													<SelectItem key={d.id} value={d.id}>
														{d.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</>
								)}
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
								No gifts received in this timeframe.
							</div>
						) : (
							<>
								{/* PER-GIFTER-UNIT BREAKDOWN */}
								<div className="overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-foreground/10">
									<Table>
										<TableHeader className="bg-muted">
											<TableRow>
												<TableHead className="pl-3">Gifter</TableHead>
												<TableHead className="text-right">Gifts</TableHead>
												<TableHead className="text-right">Off-list</TableHead>
												<TableHead className="text-right">Total</TableHead>
												<TableHead className="w-8 pr-3"></TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{groups.map(g => {
												const isOpen = openKeys.has(g.key)
												return (
													<Fragment key={g.key}>
														<TableRow className="cursor-pointer" data-state={isOpen ? 'open' : 'closed'} onClick={() => toggleOpen(g.key)}>
															<TableCell className="pl-3 py-2">
																<div className="flex items-center gap-3 min-w-0">
																	<UnitAvatars members={g.members} />
																	<div className="flex flex-col min-w-0">
																		<span className="font-medium truncate">{g.label}</span>
																		<span className="text-xs text-muted-foreground">
																			{g.totalCount} {g.totalCount === 1 ? 'gift' : 'gifts'}
																		</span>
																	</div>
																</div>
															</TableCell>
															<TableCell className="text-right">
																<CountChip count={g.giftCount} variant="gifts" />
															</TableCell>
															<TableCell className="text-right">
																<CountChip count={g.addonCount} variant="addons" />
															</TableCell>
															<TableCell className="text-right">
																<CountChip count={g.totalCount} variant="total" />
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
																			{g.rows.map((row, i) => (
																				<ReceivedDetailRow key={`${g.key}-${i}`} row={row} />
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
									</Table>
								</div>

								<Separator />

								{/* METRICS */}
								<div className="grid grid-cols-3 gap-4">
									<MetricCard
										label="Total"
										value={metrics.totalItems}
										icon={<PackageOpen className="size-6" />}
										gradient="bg-gradient-to-br from-cyan-400/40 via-sky-400/30 to-blue-500/40"
									/>
									<MetricCard
										label="Gifts"
										value={metrics.totalGifts}
										icon={<Gift className="size-6" />}
										gradient="bg-gradient-to-br from-pink-400/40 via-rose-400/30 to-orange-400/40"
									/>
									<MetricCard
										label="Off-list"
										value={metrics.totalAddons}
										icon={<PackagePlus className="size-6" />}
										gradient="bg-gradient-to-br from-violet-400/40 via-purple-400/30 to-fuchsia-500/40"
									/>
								</div>
							</>
						)}
					</>
				)}
			</div>
		</div>
	)
}

function ReceivedDetailRow({ row }: { row: ReceivedRow }) {
	return (
		<div className="flex items-start gap-3 px-3 py-2.5">
			<div className="flex flex-col items-center gap-2 shrink-0 mt-0.5">
				{row.type === 'item' ? <Gift className="size-4 text-muted-foreground" /> : <PackagePlus className="size-4 text-muted-foreground" />}
			</div>
			{row.type === 'item' && row.itemImageUrl ? (
				<img src={row.itemImageUrl} alt="" className="size-10 object-contain rounded shrink-0" />
			) : null}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-sm font-medium truncate">{row.type === 'item' ? row.itemTitle : row.description}</span>
				</div>
				<div className="text-xs text-muted-foreground truncate">{row.listName}</div>
			</div>
			{row.type === 'item' && row.quantity > 1 && (
				<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
					x{row.quantity}
				</Badge>
			)}
			{row.type === 'addon' && (
				<Badge variant="secondary" className="text-xs shrink-0">
					Off-list
				</Badge>
			)}
			<Badge variant="outline" className="text-xs tabular-nums shrink-0">
				{format(new Date(row.createdAt), 'MMM d')}
			</Badge>
		</div>
	)
}

function UnitAvatars({ members }: { members: GifterUnit['members'] }) {
	if (members.length === 0) return null
	if (members.length === 1) {
		const m = members[0]
		return <UserAvatar name={m.name} image={m.image} size="medium" />
	}
	// Pair: render two stacked avatars (similar to the partner-purchase
	// affordance on the purchases page).
	const [a, b] = members
	return (
		<div className="flex -space-x-2">
			<UserAvatar name={a.name} image={a.image} size="medium" className="ring-2 ring-card" />
			<UserAvatar name={b.name} image={b.image} size="medium" className="ring-2 ring-card" />
		</div>
	)
}

function MetricCard({ label, value, icon, gradient }: { label: string; value: number; icon?: React.ReactNode; gradient?: string }) {
	return (
		<Card size="sm" className={gradient}>
			<CardContent className="flex flex-col gap-3 py-5">
				<div className="text-base font-medium flex items-center gap-2">
					{icon}
					<span>{label}</span>
				</div>
				<div className="text-5xl font-semibold tabular-nums leading-none">{value}</div>
			</CardContent>
		</Card>
	)
}

function CountChip({ count, variant }: { count: number; variant: 'gifts' | 'addons' | 'total' }) {
	const zero = count === 0
	const classes = zero
		? 'bg-muted text-muted-foreground'
		: variant === 'gifts'
			? 'bg-cyan-700 text-white'
			: variant === 'addons'
				? 'bg-violet-700 text-white'
				: 'bg-pink-700 text-white'
	return (
		<span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${classes}`}>
			{count}
		</span>
	)
}
