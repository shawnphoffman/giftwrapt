import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Eye, SearchX, XCircle } from 'lucide-react'
import { useState } from 'react'

import { type BarcodeLookupListRow, listBarcodeLookupsAsAdmin } from '@/api/admin-barcode'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import {
	DetailField,
	DetailGrid,
	formatDateTime,
	formatDurationMs,
	formatWhen,
	STICKY_INSPECT_CELL,
	STICKY_INSPECT_HEAD,
} from './scrapes-list'

// The Lookup History card on /admin/barcode lives here. Loads the most
// recent rows from barcode_lookup_history (one per scan the iOS app
// looked up); the eye icon opens the row's candidates and raw data.
// Layout mirrors the Scrape History table on /admin/scraping.

const PROVIDER_LABELS: Record<string, string> = {
	'upcitemdb-trial': 'UPCitemdb',
	'go-upc': 'Go-UPC',
}

function providerLabel(id: string | null): string {
	if (!id) return 'none'
	return PROVIDER_LABELS[id] ?? id
}

export function BarcodeLookupsList() {
	const lookupsQuery = useQuery({ queryKey: ['admin', 'barcode-lookups'], queryFn: () => listBarcodeLookupsAsAdmin() })
	const [open, setOpen] = useState<BarcodeLookupListRow | null>(null)

	if (lookupsQuery.isLoading) {
		return <div className="text-sm text-muted-foreground">Loading lookups…</div>
	}
	const rows = lookupsQuery.data ?? []
	if (rows.length === 0) {
		return <div className="text-sm text-muted-foreground italic">No barcode lookups recorded yet.</div>
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
							<TableHead>Code</TableHead>
							<TableHead>Provider</TableHead>
							<TableHead className="whitespace-nowrap">Outcome</TableHead>
							<TableHead>Product</TableHead>
							<TableHead>By</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map(row => (
							<LookupRow key={row.id} row={row} onInspect={() => setOpen(row)} />
						))}
					</TableBody>
				</Table>
			</div>
			<LookupDetailDialog row={open} onClose={() => setOpen(null)} />
		</>
	)
}

function Outcome({ row }: { row: BarcodeLookupListRow }) {
	if (row.outcome === 'ok') {
		const count = row.results?.length ?? 0
		return (
			<span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500">
				<CheckCircle2 className="size-3.5" />
				<span>
					{count} {count === 1 ? 'result' : 'results'}
				</span>
			</span>
		)
	}
	if (row.outcome === 'not-found') {
		return (
			<span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-500">
				<SearchX className="size-3.5" />
				<span>not found</span>
			</span>
		)
	}
	return (
		<span className="inline-flex items-center gap-1.5 text-destructive">
			<XCircle className="size-3.5" />
			<span>{row.outcome}</span>
		</span>
	)
}

function LookupRow({ row, onInspect }: { row: BarcodeLookupListRow; onInspect: () => void }) {
	const first = row.results?.[0]
	const extra = (row.results?.length ?? 0) - 1

	return (
		<TableRow className="group/row">
			<TableCell className={STICKY_INSPECT_CELL}>
				<Button type="button" variant="outline" size="icon" onClick={onInspect} aria-label={`Inspect lookup #${row.id}`}>
					<Eye className="size-4" />
				</Button>
			</TableCell>
			<TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
				<span title={formatDateTime(row.createdAt)}>{formatWhen(row.createdAt)}</span>
			</TableCell>
			<TableCell className="font-mono text-xs whitespace-nowrap">{row.rawCode}</TableCell>
			<TableCell className="font-mono text-xs whitespace-nowrap">
				{row.source === 'cache' && (
					<Badge variant="outline" className="mr-1.5 text-3xs font-sans" title="Served from the lookup cache">
						Cache
					</Badge>
				)}
				{providerLabel(row.providerId)}
			</TableCell>
			<TableCell className="whitespace-nowrap text-xs">
				<Outcome row={row} />
				{typeof row.ms === 'number' && <span className="ml-2 text-muted-foreground">{formatDurationMs(row.ms)}</span>}
			</TableCell>
			<TableCell className="text-xs">
				{first?.title ? (
					<div className="flex flex-col w-56 max-w-[40vw]">
						<span className="truncate" title={first.title}>
							{first.title}
						</span>
						{(first.brand || extra > 0) && (
							<span className="text-muted-foreground truncate">
								{first.brand}
								{first.brand && extra > 0 && ' · '}
								{extra > 0 && `+${extra} more`}
							</span>
						)}
					</div>
				) : (
					<span className="text-muted-foreground italic">none</span>
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

function LookupDetailDialog({ row, onClose }: { row: BarcodeLookupListRow | null; onClose: () => void }) {
	return (
		<Dialog open={row !== null} onOpenChange={next => !next && onClose()}>
			<DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Barcode Lookup {row && <span className="font-mono text-base">#{row.id}</span>}</DialogTitle>
					<DialogDescription>The saved record from the barcode_lookup_history table.</DialogDescription>
				</DialogHeader>

				{row && (
					<div className="space-y-4 text-sm">
						<DetailGrid>
							<DetailField label="When">{formatDateTime(row.createdAt)}</DetailField>
							<DetailField label="Code">
								<span className="font-mono text-xs">{row.rawCode}</span>
								{row.gtin14 && row.gtin14 !== row.rawCode && (
									<span className="ml-2 text-xs text-muted-foreground font-mono">GTIN-14 {row.gtin14}</span>
								)}
							</DetailField>
							<DetailField label="Provider">
								<span className="font-mono text-xs">{providerLabel(row.providerId)}</span>
								{row.source === 'cache' && <span className="ml-2 text-xs text-muted-foreground">from cache</span>}
							</DetailField>
							<DetailField label="Outcome">
								<span className="text-xs">
									<Outcome row={row} />
								</span>
								{typeof row.ms === 'number' && <span className="ml-2 text-xs text-muted-foreground">{formatDurationMs(row.ms)}</span>}
							</DetailField>
							{row.errorMessage && (
								<DetailField label="Error">
									<span className="font-mono text-xs text-destructive">{row.errorMessage}</span>
								</DetailField>
							)}
							<DetailField label="Scanned By">
								{row.userName || row.userEmail ? (
									<>
										{row.userName ?? ''}
										{row.userEmail && <span className="ml-2 text-xs text-muted-foreground">{row.userEmail}</span>}
									</>
								) : (
									<span className="text-muted-foreground italic">unknown</span>
								)}
							</DetailField>
						</DetailGrid>

						{row.results && row.results.length > 0 && (
							<div className="rounded-md border p-3 space-y-2">
								<h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Candidates ({row.results.length})</h4>
								<ul className="space-y-2">
									{row.results.map((c, i) => (
										<li key={i} className="flex items-start gap-3">
											{c.imageUrl ? (
												<img
													src={c.imageUrl}
													alt=""
													loading="lazy"
													referrerPolicy="no-referrer"
													className="size-12 shrink-0 rounded border bg-muted object-contain"
												/>
											) : (
												<div className="size-12 shrink-0 rounded border bg-muted" />
											)}
											<div className="min-w-0 flex-1">
												<div className="wrap-break-word">{c.title ?? <span className="text-muted-foreground italic">no title</span>}</div>
												{c.brand && <div className="text-xs text-muted-foreground">{c.brand}</div>}
												{c.candidateUrl && (
													<a
														href={c.candidateUrl}
														target="_blank"
														rel="noreferrer noopener"
														className="inline-flex items-center gap-1 text-xs underline decoration-dotted underline-offset-3 break-all"
													>
														{c.candidateUrl}
														<ExternalLink className="size-3 shrink-0 text-muted-foreground" />
													</a>
												)}
											</div>
										</li>
									))}
								</ul>
							</div>
						)}

						<div className="space-y-1.5">
							<h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Raw Results</h4>
							<pre className="text-xs bg-muted/50 rounded-md p-2 overflow-x-auto font-mono leading-snug max-h-[40vh] overflow-y-auto">
								{row.results === null ? (
									<span className="text-muted-foreground italic">(none stored)</span>
								) : (
									JSON.stringify(row.results, null, 2)
								)}
							</pre>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
