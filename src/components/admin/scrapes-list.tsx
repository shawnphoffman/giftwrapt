import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Eye, XCircle } from 'lucide-react'
import { useState } from 'react'

import { getScrapeDetailAsAdmin, listScrapesAsAdmin, type ScrapeListRow } from '@/api/admin-scrapes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAdminAppSettings } from '@/hooks/use-app-settings'
import { cn } from '@/lib/utils'

// /admin/scrapes lives here. Loads the most recent N attempt rows from
// itemScrapes joined to items / lists / users; clicking the eye icon on a
// row opens a dialog with the full detail (raw response jsonb + every
// extracted column).

// The Inspect column lives at the start of the table and stays pinned to
// the left edge while horizontal scroll happens. The cell needs an
// opaque background that matches the surrounding card surface; the
// `group-hover/row:bg-muted/40` rule keeps the row's hover bg consistent
// across the sticky and non-sticky cells. A right border separates the
// pinned column from the scrolling content visually.
const STICKY_INSPECT_HEAD = 'sticky left-0 z-20 w-[52px] bg-card border-r'
const STICKY_INSPECT_CELL = 'sticky left-0 z-10 w-[52px] bg-card border-r text-right group-hover/row:bg-muted/40'

export function ScrapesList() {
	const scrapesQuery = useQuery({ queryKey: ['admin', 'scrapes'], queryFn: () => listScrapesAsAdmin() })
	const settingsQuery = useAdminAppSettings()
	const [openId, setOpenId] = useState<number | null>(null)

	// Map every configured provider entry's runtime id (`${type}:${id}`) to
	// its admin-assigned name so the table renders friendly labels instead
	// of opaque ids. Legacy rows persisted under the old singleton ids
	// (e.g. `browserless-provider`) won't have a match and fall back to
	// rendering the raw id, which is fine.
	//
	// Multi-provider merged winners come back as `merged:a,b,c` from the
	// orchestrator. We resolve each segment to its name and join them so
	// the column reads "Browserless + My Amazon scraper (merged)".
	const customNamesById = new Map<string, string>()
	for (const entry of settingsQuery.data?.scrapeProviders ?? []) {
		customNamesById.set(`${entry.type}:${entry.id}`, entry.name)
	}

	const labelForScraperId = (rawId: string): string => {
		if (rawId.startsWith('merged:')) {
			const ids = rawId.slice('merged:'.length).split(',').filter(Boolean)
			const names = ids.map(id => customNamesById.get(id) ?? id)
			return `${names.join(' + ')} (merged)`
		}
		return customNamesById.get(rawId) ?? rawId
	}

	if (scrapesQuery.isLoading) {
		return <div className="text-sm text-muted-foreground">Loading scrapes…</div>
	}
	const rows = scrapesQuery.data ?? []
	if (rows.length === 0) {
		return <div className="text-sm text-muted-foreground italic">No scrape attempts recorded yet.</div>
	}

	return (
		<>
			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className={STICKY_INSPECT_HEAD}>
								<span className="sr-only">Inspect</span>
							</TableHead>
							<TableHead className="whitespace-nowrap">When</TableHead>
							<TableHead>URL</TableHead>
							<TableHead>Provider</TableHead>
							<TableHead className="whitespace-nowrap">Outcome</TableHead>
							<TableHead>Item</TableHead>
							<TableHead>By</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map(row => (
							<ScrapeRow key={row.id} row={row} labelFor={labelForScraperId} onInspect={() => setOpenId(row.id)} />
						))}
					</TableBody>
				</Table>
			</div>
			<ScrapeDetailDialog openId={openId} onClose={() => setOpenId(null)} labelFor={labelForScraperId} />
		</>
	)
}

function ScrapeRow({ row, labelFor, onInspect }: { row: ScrapeListRow; labelFor: (id: string) => string; onInspect: () => void }) {
	const providerLabel = labelFor(row.scraperId)
	const outcome = row.ok ? (
		<span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500">
			<CheckCircle2 className="size-3.5" />
			<span>{typeof row.score === 'number' ? `score ${row.score}` : 'ok'}</span>
		</span>
	) : (
		<span className="inline-flex items-center gap-1.5 text-destructive">
			<XCircle className="size-3.5" />
			<span>{row.errorCode ?? 'failed'}</span>
		</span>
	)

	return (
		<TableRow className="group/row">
			<TableCell className={STICKY_INSPECT_CELL}>
				<Button type="button" variant="ghost" size="icon" onClick={onInspect} aria-label={`Inspect scrape #${row.id}`}>
					<Eye className="size-4" />
				</Button>
			</TableCell>
			<TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
				<span title={formatDateTime(row.createdAt)}>{formatWhen(row.createdAt)}</span>
			</TableCell>
			<TableCell>
				{/* Constrain via an inner block — `max-w-*` on a <td> alone is
				    ignored by the auto table layout; this gives the truncate
				    something to bite against. */}
				<div className="w-[260px] max-w-[40vw]">
					<a
						href={row.url}
						target="_blank"
						rel="noreferrer noopener"
						className="flex items-center gap-1 underline decoration-dotted underline-offset-3 hover:text-foreground"
						title={row.url}
					>
						<span className="truncate font-mono text-xs">{shortenUrl(row.url)}</span>
						<ExternalLink className="size-3 shrink-0 text-muted-foreground" />
					</a>
				</div>
			</TableCell>
			<TableCell className="font-mono text-xs">{providerLabel}</TableCell>
			<TableCell className="whitespace-nowrap text-xs">
				{outcome}
				{typeof row.ms === 'number' && <span className="ml-2 text-muted-foreground">{formatDurationMs(row.ms)}</span>}
			</TableCell>
			<TableCell className="text-xs">
				{row.itemId && row.itemTitle ? (
					<div className="flex flex-col">
						<span className="truncate" title={row.itemTitle}>
							{row.itemTitle}
						</span>
						{row.listName && <span className="text-muted-foreground truncate">{row.listName}</span>}
					</div>
				) : (
					<Badge variant="secondary" className="text-[10px]">
						standalone
					</Badge>
				)}
			</TableCell>
			<TableCell className="text-xs">
				{row.userName || row.userEmail ? (
					<div className="flex flex-col">
						{row.userName && <span className="truncate">{row.userName}</span>}
						{row.userEmail && <span className="text-muted-foreground truncate">{row.userEmail}</span>}
					</div>
				) : (
					<span className="text-muted-foreground italic">unknown</span>
				)}
			</TableCell>
		</TableRow>
	)
}

function ScrapeDetailDialog({
	openId,
	onClose,
	labelFor,
}: {
	openId: number | null
	onClose: () => void
	labelFor: (id: string) => string
}) {
	const open = openId !== null
	const detailQuery = useQuery({
		queryKey: ['admin', 'scrapes', openId],
		queryFn: () => getScrapeDetailAsAdmin({ data: { id: openId! } }),
		enabled: open,
	})

	const detail = detailQuery.data?.kind === 'ok' ? detailQuery.data.detail : null
	const providerLabel = detail ? labelFor(detail.scraperId) : ''

	return (
		<Dialog open={open} onOpenChange={next => !next && onClose()}>
			<DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Scrape attempt {openId !== null && <span className="font-mono text-base">#{openId}</span>}</DialogTitle>
					<DialogDescription>Persisted row from item_scrapes. Use this to debug provider responses.</DialogDescription>
				</DialogHeader>

				{detailQuery.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
				{detailQuery.data?.kind === 'error' && <div className="text-sm text-destructive">Scrape not found.</div>}

				{detail && (
					<div className="space-y-4 text-sm">
						<DetailGrid>
							<DetailField label="When">{formatDateTime(detail.createdAt)}</DetailField>
							<DetailField label="URL">
								<a
									href={detail.url}
									target="_blank"
									rel="noreferrer noopener"
									className="break-all underline decoration-dotted underline-offset-3 font-mono text-xs"
								>
									{detail.url}
								</a>
							</DetailField>
							<DetailField label="Provider">
								<span className="font-mono text-xs">{providerLabel}</span>
								{providerLabel !== detail.scraperId && (
									<span className="ml-2 text-muted-foreground text-xs font-mono">({detail.scraperId})</span>
								)}
							</DetailField>
							<DetailField label="Outcome">
								<span className={cn('font-mono text-xs', detail.ok ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive')}>
									{detail.ok ? 'ok' : (detail.errorCode ?? 'failed')}
								</span>
								{typeof detail.score === 'number' && <span className="ml-2 text-xs text-muted-foreground">score {detail.score}</span>}
								{typeof detail.ms === 'number' && <span className="ml-2 text-xs text-muted-foreground">{formatDurationMs(detail.ms)}</span>}
							</DetailField>
							<DetailField label="Triggered by">
								{detail.userName || detail.userEmail ? (
									<>
										{detail.userName ?? ''}
										{detail.userEmail && <span className="ml-2 text-xs text-muted-foreground">{detail.userEmail}</span>}
									</>
								) : (
									<span className="text-muted-foreground italic">unknown</span>
								)}
							</DetailField>
							<DetailField label="Item">
								{detail.itemId && detail.itemTitle ? (
									<>
										#{detail.itemId} - {detail.itemTitle}
										{detail.listName && <span className="ml-2 text-xs text-muted-foreground">in {detail.listName}</span>}
									</>
								) : (
									<span className="text-muted-foreground italic">standalone (no item attached)</span>
								)}
							</DetailField>
						</DetailGrid>

						{(detail.title ||
							detail.cleanTitle ||
							detail.description ||
							detail.price ||
							(detail.imageUrls && detail.imageUrls.length > 0)) && (
							<div className="rounded-md border p-3 space-y-1.5">
								<h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Extracted columns</h4>
								<DetailGrid>
									{detail.title && <DetailField label="Title">{detail.title}</DetailField>}
									{detail.cleanTitle && detail.cleanTitle !== detail.title && (
										<DetailField label="Cleaned title">{detail.cleanTitle}</DetailField>
									)}
									{detail.price && (
										<DetailField label="Price">
											{detail.price}
											{detail.currency && <span className="ml-1 text-muted-foreground">{detail.currency}</span>}
										</DetailField>
									)}
									{detail.description && <DetailField label="Description">{detail.description}</DetailField>}
									{detail.imageUrls && detail.imageUrls.length > 0 && (
										<DetailField label={`Images (${detail.imageUrls.length})`}>
											<ul className="list-disc list-inside text-xs font-mono space-y-0.5">
												{detail.imageUrls.map(url => (
													<li key={url} className="break-all">
														{url}
													</li>
												))}
											</ul>
										</DetailField>
									)}
								</DetailGrid>
							</div>
						)}

						<div className="space-y-1.5">
							<h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Raw response</h4>
							<pre className="text-xs bg-muted/50 rounded-md p-2 overflow-x-auto font-mono leading-snug max-h-[40vh] overflow-y-auto">
								{detail.response === null ? (
									<span className="text-muted-foreground italic">(none stored)</span>
								) : (
									JSON.stringify(detail.response, null, 2)
								)}
							</pre>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

function DetailGrid({ children }: { children: React.ReactNode }) {
	return (
		<dl className="grid grid-cols-1 gap-2 @md/admin-content:grid-cols-[max-content_1fr] @md/admin-content:gap-x-4 @md/admin-content:gap-y-1.5">
			{children}
		</dl>
	)
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<>
			<dt className="text-xs uppercase tracking-wide text-muted-foreground @md/admin-content:text-right">{label}</dt>
			<dd className="text-sm break-words">{children}</dd>
		</>
	)
}

function shortenUrl(raw: string): string {
	try {
		const u = new URL(raw)
		const path = u.pathname.length > 60 ? `${u.pathname.slice(0, 30)}…${u.pathname.slice(-20)}` : u.pathname
		return `${u.host}${path}`
	} catch {
		return raw
	}
}

function formatDateTime(d: Date): string {
	const date = typeof d === 'string' ? new Date(d) : d
	return date.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})
}

// Compact form for the table column: relative ("5m ago") for the last
// day, short absolute ("Apr 26, 7:48 PM") for older rows. Full ISO-ish
// form is supplied via the cell's title attribute when you hover.
function formatWhen(d: Date): string {
	const date = typeof d === 'string' ? new Date(d) : d
	const ageSec = (Date.now() - date.getTime()) / 1000
	if (ageSec < 60) return `${Math.max(1, Math.floor(ageSec))}s ago`
	if (ageSec < 60 * 60) return `${Math.floor(ageSec / 60)}m ago`
	if (ageSec < 60 * 60 * 24) return `${Math.floor(ageSec / 3600)}h ago`
	return date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	})
}

function formatDurationMs(ms: number): string {
	if (ms < 1000) return `${ms}ms`
	const s = ms / 1000
	if (s < 10) return `${s.toFixed(1)}s`
	return `${Math.round(s)}s`
}
