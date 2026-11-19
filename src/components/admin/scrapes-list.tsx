import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Eye, XCircle } from 'lucide-react'
import { useState } from 'react'

import { getScrapeDetailAsAdmin, listScrapesAsAdmin, type ScrapeListRow, type ScrapeResponseJson } from '@/api/admin-scrapes'
import { RichMessage } from '@/components/common/rich-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAdminAppSettings } from '@/hooks/use-app-settings'
import { formatDate, formatNumber } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

import { buildScraperLookups } from './scrape-stats'

// The Scrape History card on /admin/scraping lives here. Loads the most recent N attempt rows from
// itemScrapes joined to items / lists / users; clicking the eye icon on a
// row opens a dialog with the full detail (raw response jsonb + every
// extracted column).

// The Inspect column lives at the start of the table and stays pinned to
// the left edge while horizontal scroll happens. The cell needs an
// opaque background that matches the surrounding card surface; the
// `group-hover/row:bg-muted/40` rule keeps the row's hover bg consistent
// across the sticky and non-sticky cells. A right border separates the
// pinned column from the scrolling content visually.
export const STICKY_INSPECT_HEAD = 'sticky left-0 z-20 w-13 bg-card border-r'
export const STICKY_INSPECT_CELL = 'sticky left-0 z-10 w-13 bg-card border-r text-right group-hover/row:bg-muted/40'

export function ScrapesList() {
	const scrapesQuery = useQuery({ queryKey: ['admin', 'scrapes'], queryFn: () => listScrapesAsAdmin() })
	const settingsQuery = useAdminAppSettings()
	const [openId, setOpenId] = useState<number | null>(null)

	// Same provider labels as the Scrape Health card: admin-assigned names,
	// "Built-in" for the always-on fetch provider, and merged results
	// (`merged:a,b,c`) as "Built-in + My Amazon scraper (merged)". Ids no
	// longer configured render raw.
	const { labelFor: labelForScraperId } = buildScraperLookups(settingsQuery.data?.scrapeProviders ?? [])

	if (scrapesQuery.isLoading) {
		return <div className="text-sm text-muted-foreground">{m.admin_scraping_history_loading()}</div>
	}
	const rows = scrapesQuery.data ?? []
	if (rows.length === 0) {
		return <div className="text-sm text-muted-foreground italic">{m.admin_scraping_history_empty()}</div>
	}

	return (
		<>
			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className={STICKY_INSPECT_HEAD}>
								<span className="sr-only">{m.admin_scraping_history_inspect()}</span>
							</TableHead>
							<TableHead className="whitespace-nowrap">{m.admin_scraping_field_when()}</TableHead>
							<TableHead>{m.admin_scraping_field_url()}</TableHead>
							<TableHead>{m.admin_scraping_field_provider()}</TableHead>
							<TableHead className="whitespace-nowrap">{m.admin_scraping_field_outcome()}</TableHead>
							<TableHead>{m.admin_scraping_field_item()}</TableHead>
							<TableHead>{m.admin_scraping_history_col_by()}</TableHead>
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
			<span>{typeof row.score === 'number' ? m.admin_scraping_score({ score: row.score }) : m.admin_scraping_outcome_ok()}</span>
		</span>
	) : (
		<span className="inline-flex items-center gap-1.5 text-destructive">
			<XCircle className="size-3.5" />
			<span>{row.errorCode ?? m.admin_scraping_outcome_failed()}</span>
		</span>
	)

	return (
		<TableRow className="group/row">
			<TableCell className={STICKY_INSPECT_CELL}>
				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={onInspect}
					aria-label={m.admin_scraping_history_inspect_row({ id: `#${row.id}` })}
				>
					<Eye className="size-4" />
				</Button>
			</TableCell>
			<TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
				<span title={formatDateTime(row.createdAt)}>{formatWhen(row.createdAt)}</span>
			</TableCell>
			<TableCell>
				{/* Constrain via an inner block, since `max-w-*` on a <td> alone is
				    ignored by the auto table layout; this gives the truncate
				    something to bite against. */}
				<div className="w-65 max-w-[40vw]">
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
			<TableCell className="font-mono text-xs">
				{row.isFinal && (
					<Badge variant="outline" className="mr-1.5 text-3xs font-sans" title={m.admin_scraping_history_final_title()}>
						{m.admin_scraping_history_final_badge()}
					</Badge>
				)}
				{providerLabel}
			</TableCell>
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
					<Badge variant="outline" className="text-3xs">
						{m.admin_scraping_standalone()}
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
					<span className="text-muted-foreground italic">{m.admin_scraping_unknown()}</span>
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
	const scoreParts = detail ? readScoreParts(detail.response) : null
	const providerLabel = detail ? labelFor(detail.scraperId) : ''

	return (
		<Dialog open={open} onOpenChange={next => !next && onClose()}>
			<DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{openId !== null ? (
							<RichMessage
								parts={m.admin_scraping_detail_title_id.parts({ id: `#${openId}` })}
								tags={{ mono: c => <span className="font-mono text-base">{c}</span> }}
							/>
						) : (
							m.admin_scraping_detail_title()
						)}
					</DialogTitle>
					<DialogDescription>{m.admin_scraping_detail_description()}</DialogDescription>
				</DialogHeader>

				{detailQuery.isLoading && <div className="text-sm text-muted-foreground">{m.state_loading()}</div>}
				{detailQuery.data?.kind === 'error' && <div className="text-sm text-destructive">{m.admin_scraping_detail_not_found()}</div>}

				{detail && (
					<div className="space-y-4 text-sm">
						<DetailGrid>
							<DetailField label={m.admin_scraping_field_when()}>{formatDateTime(detail.createdAt)}</DetailField>
							<DetailField label={m.admin_scraping_field_url()}>
								<a
									href={detail.url}
									target="_blank"
									rel="noreferrer noopener"
									className="break-all underline decoration-dotted underline-offset-3 font-mono text-xs"
								>
									{detail.url}
								</a>
							</DetailField>
							<DetailField label={m.admin_scraping_field_provider()}>
								<span className="font-mono text-xs">{providerLabel}</span>
								{providerLabel !== detail.scraperId && (
									<span className="ml-2 text-muted-foreground text-xs font-mono">({detail.scraperId})</span>
								)}
							</DetailField>
							<DetailField label={m.admin_scraping_field_outcome()}>
								<span className={cn('font-mono text-xs', detail.ok ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive')}>
									{detail.ok ? m.admin_scraping_outcome_ok() : (detail.errorCode ?? m.admin_scraping_outcome_failed())}
								</span>
								{typeof detail.score === 'number' && (
									<span className="ml-2 text-xs text-muted-foreground">{m.admin_scraping_score({ score: detail.score })}</span>
								)}
								{typeof detail.ms === 'number' && <span className="ml-2 text-xs text-muted-foreground">{formatDurationMs(detail.ms)}</span>}
							</DetailField>
							{scoreParts && (
								<DetailField label={m.admin_scraping_field_score()}>
									<ScoreBreakdownLine parts={scoreParts} total={detail.score} />
								</DetailField>
							)}
							<DetailField label={m.admin_scraping_field_triggered_by()}>
								{detail.userName || detail.userEmail ? (
									<>
										{detail.userName ?? ''}
										{detail.userEmail && <span className="ml-2 text-xs text-muted-foreground">{detail.userEmail}</span>}
									</>
								) : (
									<span className="text-muted-foreground italic">{m.admin_scraping_unknown()}</span>
								)}
							</DetailField>
							<DetailField label={m.admin_scraping_field_item()}>
								{detail.itemId && detail.itemTitle ? (
									<>
										{`#${detail.itemId} - ${detail.itemTitle}`}
										{detail.listName && (
											<span className="ml-2 text-xs text-muted-foreground">{m.admin_scraping_in_list({ listName: detail.listName })}</span>
										)}
									</>
								) : (
									<span className="text-muted-foreground italic">{m.admin_scraping_detail_standalone()}</span>
								)}
							</DetailField>
						</DetailGrid>

						{(detail.title ||
							detail.cleanTitle ||
							detail.description ||
							detail.price ||
							(detail.imageUrls && detail.imageUrls.length > 0)) && (
							<div className="rounded-md border p-3 space-y-1.5">
								<h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.admin_scraping_detail_extracted()}</h4>
								<DetailGrid>
									{detail.title && <DetailField label={m.admin_scraping_field_title()}>{detail.title}</DetailField>}
									{detail.cleanTitle && detail.cleanTitle !== detail.title && (
										<DetailField label={m.admin_scraping_field_clean_title()}>{detail.cleanTitle}</DetailField>
									)}
									{detail.price && (
										<DetailField label={m.admin_scraping_field_price()}>
											{detail.price}
											{detail.currency && <span className="ml-1 text-muted-foreground">{detail.currency}</span>}
										</DetailField>
									)}
									{detail.description && <DetailField label={m.admin_scraping_field_description()}>{detail.description}</DetailField>}
									{detail.imageUrls && detail.imageUrls.length > 0 && (
										<DetailField label={m.admin_scraping_field_images({ count: detail.imageUrls.length })}>
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
							<h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.admin_scraping_detail_raw()}</h4>
							<pre className="text-xs bg-muted/50 rounded-md p-2 overflow-x-auto font-mono leading-snug max-h-[40vh] overflow-y-auto">
								{detail.response === null ? (
									<span className="text-muted-foreground italic">{m.admin_scraping_detail_raw_none()}</span>
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

// Per-signal score itemization the orchestrator stores in the response
// jsonb (`scoreParts`). Rows persisted before it existed have none, and the
// drawer just omits the line. Labels mirror SCORE_POINTS in
// src/lib/scrapers/score.ts (not imported: that module is server-side).
function scoreSignalLabel(signal: string): string {
	switch (signal) {
		case 'title':
			return m.admin_scraping_signal_title()
		case 'price':
			return m.admin_scraping_signal_price()
		case 'photo':
			return m.admin_scraping_signal_photo()
		case 'shareCard':
			return m.admin_scraping_signal_share_card()
		case 'description':
			return m.admin_scraping_signal_description()
		case 'botWall':
			return m.admin_scraping_signal_bot_wall()
		case 'errorTitle':
			return m.admin_scraping_signal_error_title()
		default:
			return signal
	}
}

type ScorePart = { signal: string; points: number }

function readScoreParts(response: ScrapeResponseJson | null): Array<ScorePart> | null {
	if (!response || typeof response !== 'object' || Array.isArray(response)) return null
	const raw = response.scoreParts
	if (!Array.isArray(raw)) return null
	const parts: Array<ScorePart> = []
	for (const p of raw) {
		if (p && typeof p === 'object' && !Array.isArray(p) && typeof p.signal === 'string' && typeof p.points === 'number') {
			parts.push({ signal: p.signal, points: p.points })
		}
	}
	return parts
}

function ScoreBreakdownLine({ parts, total }: { parts: Array<ScorePart>; total: number | null }) {
	if (parts.length === 0)
		return <span className="text-xs text-muted-foreground">{m.admin_scraping_score_no_signals({ total: total ?? 0 })}</span>
	return (
		<span className="text-xs font-mono">
			{parts.map((p, i) => (
				<span key={p.signal} className={cn(p.points < 0 && 'text-destructive')}>
					{i > 0 && <span className="text-muted-foreground"> · </span>}
					{scoreSignalLabel(p.signal)} {p.points > 0 ? `+${p.points}` : p.points}
				</span>
			))}
			{typeof total === 'number' && <span className="text-muted-foreground"> = {total}</span>}
		</span>
	)
}

export function DetailGrid({ children }: { children: React.ReactNode }) {
	return (
		<dl className="grid grid-cols-1 gap-2 @md/admin-content:grid-cols-[max-content_1fr] @md/admin-content:gap-x-4 @md/admin-content:gap-y-1.5">
			{children}
		</dl>
	)
}

export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<>
			<dt className="text-xs uppercase tracking-wide text-muted-foreground @md/admin-content:text-right">{label}</dt>
			<dd className="text-sm wrap-break-word">{children}</dd>
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

export function formatDateTime(d: Date): string {
	const date = typeof d === 'string' ? new Date(d) : d
	return formatDate(date, {
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
export function formatWhen(d: Date): string {
	const date = typeof d === 'string' ? new Date(d) : d
	const ageSec = (Date.now() - date.getTime()) / 1000
	if (ageSec < 60) return m.admin_scraping_ago_seconds({ count: Math.max(1, Math.floor(ageSec)) })
	if (ageSec < 60 * 60) return m.admin_scraping_ago_minutes({ count: Math.floor(ageSec / 60) })
	if (ageSec < 60 * 60 * 24) return m.admin_scraping_ago_hours({ count: Math.floor(ageSec / 3600) })
	return formatDate(date, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	})
}

export function formatDurationMs(ms: number): string {
	if (ms < 1000) return `${ms}ms`
	const s = ms / 1000
	if (s < 10) return `${formatNumber(s, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}s`
	return `${Math.round(s)}s`
}
