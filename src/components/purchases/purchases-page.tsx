import { format } from 'date-fns'
import { ExternalLink, Pencil, Receipt, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { AddonPurchaseRow, MyPurchasesResult, PurchaseRow } from '@/api/purchases'
import UserAvatar from '@/components/common/user-avatar'
import { PurchaseEditDialog } from '@/components/purchases/purchase-edit-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Purchase = PurchaseRow | AddonPurchaseRow

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

function purchaseKey(p: Purchase): string {
	return p.type === 'claim' ? `claim-${p.giftId}` : `addon-${p.addonId}`
}

function purchaseTitle(p: Purchase): string {
	return p.type === 'claim' ? p.itemTitle : p.description
}

export function PurchasesPageContent({ claims, addons }: MyPurchasesResult) {
	const [timeframe, setTimeframe] = useState<Timeframe>('60d')
	const [grouped, setGrouped] = useState(true)
	const [editing, setEditing] = useState<Purchase | null>(null)
	const [dialogOpen, setDialogOpen] = useState(false)

	const allPurchases: Array<Purchase> = useMemo(() => {
		const combined: Array<Purchase> = [...claims, ...addons]
		return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
	}, [claims, addons])

	const filtered: Array<Purchase> = useMemo(() => {
		const cutoff = timeframeCutoff(timeframe)
		if (!cutoff) return allPurchases
		return allPurchases.filter(p => new Date(p.createdAt) >= cutoff)
	}, [allPurchases, timeframe])

	const groups = useMemo(() => {
		const map = new Map<string, { ownerId: string; ownerName: string; ownerImage: string | null; items: Array<Purchase> }>()
		for (const p of filtered) {
			const existing = map.get(p.listOwnerId)
			if (existing) {
				existing.items.push(p)
			} else {
				map.set(p.listOwnerId, {
					ownerId: p.listOwnerId,
					ownerName: p.listOwnerName || p.listOwnerEmail,
					ownerImage: p.listOwnerImage,
					items: [p],
				})
			}
		}
		return Array.from(map.values())
	}, [filtered])

	function openEdit(p: Purchase) {
		setEditing(p)
		setDialogOpen(true)
	}

	function handleDialogChange(open: boolean) {
		setDialogOpen(open)
		if (!open) setEditing(null)
	}

	const hasAny = claims.length > 0 || addons.length > 0

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Purchases</h1>
					<Receipt className="text-pink-500 wish-page-icon" />
				</div>

				<p className="text-sm text-muted-foreground">
					This page displays all of your purchases and addons. If you have a partner in the system, their purchases will be displayed here
					as well, excluding gifts for you. You can edit purchases to add private information like pricing and notes. This information will
					not be visible to the recipient.
				</p>

				{!hasAny ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						No purchases yet. Claim items from other people's lists to see them here.
					</div>
				) : (
					<>
						{/* CONTROLS */}
						<div className="flex items-center justify-between gap-3 flex-wrap">
							<div className="flex items-center gap-2">
								<Label>Timeframe:</Label>
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
							<Button variant={grouped ? 'default' : 'outline'} onClick={() => setGrouped(g => !g)}>
								{grouped ? 'Ungroup' : 'Group'}
							</Button>
						</div>

						{filtered.length === 0 ? (
							<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
								No purchases in this timeframe.
							</div>
						) : grouped ? (
							<div className="flex flex-col gap-4">
								{groups.map(g => (
									<div key={g.ownerId} className="flex flex-col overflow-hidden border rounded-lg bg-accent">
										<div className="flex items-center gap-3 p-3 border-b bg-muted/30">
											<UserAvatar name={g.ownerName} image={g.ownerImage} size="medium" />
											<div className="flex items-baseline gap-2 min-w-0">
												<span className="font-semibold text-lg truncate">{g.ownerName}</span>
												<span className="text-sm text-muted-foreground shrink-0">
													({g.items.length} {g.items.length === 1 ? 'item' : 'items'})
												</span>
											</div>
										</div>
										<div className="flex flex-col divide-y">
											{g.items.map(p => (
												<PurchaseRowView key={purchaseKey(p)} purchase={p} showOwnerAvatar onEdit={() => openEdit(p)} />
											))}
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
								{filtered.map(p => (
									<PurchaseRowView key={purchaseKey(p)} purchase={p} showOwnerAvatar onEdit={() => openEdit(p)} />
								))}
							</div>
						)}
					</>
				)}
			</div>

			<PurchaseEditDialog open={dialogOpen} onOpenChange={handleDialogChange} purchase={editing} />
		</div>
	)
}

function Label({ children }: { children: React.ReactNode }) {
	return <span className="text-sm text-muted-foreground">{children}</span>
}

type RowProps = {
	purchase: Purchase
	showOwnerAvatar: boolean
	onEdit: () => void
}

function PurchaseRowView({ purchase, showOwnerAvatar, onEdit }: RowProps) {
	const title = purchaseTitle(purchase)
	const ownerDisplay = purchase.listOwnerName || purchase.listOwnerEmail
	const url = purchase.type === 'claim' ? purchase.itemUrl : null
	const hasNotes = !!purchase.notes
	const isAddon = purchase.type === 'addon'
	const isArchivedAddon = isAddon && (purchase).isArchived

	return (
		<div className="flex items-center gap-3 p-3">
			{showOwnerAvatar && (
				<div className="shrink-0">
					<UserAvatar name={ownerDisplay} image={purchase.listOwnerImage} size="small" />
				</div>
			)}
			{hasNotes && <Zap className="size-4 text-yellow-500 shrink-0 fill-yellow-500" />}
			<div className="flex-1 min-w-0">
				<div className="font-medium leading-tight truncate flex items-center gap-2">
					<span className="truncate">{title}</span>
					{url && (
						<a href={url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
							<ExternalLink className="size-4" />
						</a>
					)}
				</div>
				{hasNotes && <div className="text-xs text-muted-foreground truncate">{purchase.notes}</div>}
				<div className="text-xs text-muted-foreground truncate">{purchase.listName}</div>
			</div>
			{purchase.type === 'claim' && purchase.quantity > 1 && (
				<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
					x{purchase.quantity}
				</Badge>
			)}
			{purchase.totalCost && (
				<Badge variant="outline" className="text-xs tabular-nums shrink-0">
					${purchase.totalCost}
				</Badge>
			)}
			{isAddon && (
				<Badge variant="secondary" className="text-xs shrink-0">
					{isArchivedAddon ? 'Given' : 'Addon'}
				</Badge>
			)}
			<Badge variant="default" className="text-xs tabular-nums shrink-0">
				{format(new Date(purchase.createdAt), 'MMM d')}
			</Badge>
			<Button
				variant="ghost"
				size="icon"
				className="size-8 shrink-0 text-yellow-600 hover:text-yellow-500"
				onClick={onEdit}
				aria-label="Edit purchase details"
			>
				<Pencil className="size-4" />
			</Button>
		</div>
	)
}
