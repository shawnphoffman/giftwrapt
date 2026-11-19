import { Link } from '@tanstack/react-router'
import { FileText, Lock, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { StorageObjectRow, StorageSummary } from '@/api/admin-storage'
import { RichMessage } from '@/components/common/rich-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatNumber } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

// Pure presentational pieces of /admin/storage. No data fetching, no
// dialogs - everything is prop-driven so Storybook fixtures can exercise
// the layout, badges, and empty/loading states without standing up a
// QueryClient cache.

export type StorageBrowserFilter = 'all' | 'avatars' | 'items' | 'purchases' | 'orphans'

// Stand-ins for a value that is still loading or does not exist.
const PENDING = '…'
const NONE = '–'

export function StorageSummaryBar({
	summary,
	loading,
	deleteOrphansDisabled,
	onDeleteOrphans,
}: {
	summary: StorageSummary | null
	loading: boolean
	deleteOrphansDisabled?: boolean
	onDeleteOrphans?: () => void
}) {
	return (
		<div className="flex flex-col gap-2 rounded-md border bg-muted/30 px-4 py-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
					<div className="space-y-1">
						<dt className="text-xs uppercase tracking-wide text-muted-foreground">{m.admin_storage_summary_objects()}</dt>
						<dd className="font-mono tabular-nums">{loading ? PENDING : summary ? formatNumber(summary.totalCount) : NONE}</dd>
					</div>
					<div className="space-y-1">
						<dt className="text-xs uppercase tracking-wide text-muted-foreground">{m.admin_storage_size()}</dt>
						<dd className="font-mono tabular-nums">{loading ? PENDING : summary ? formatBytes(summary.totalBytes) : NONE}</dd>
					</div>
					<div className="space-y-1">
						<dt className="text-xs uppercase tracking-wide text-muted-foreground">{m.admin_storage_summary_orphans()}</dt>
						<dd className="font-mono tabular-nums">
							{loading ? PENDING : summary ? `${formatNumber(summary.orphanCount)} (${formatBytes(summary.orphanBytes)})` : NONE}
						</dd>
					</div>
				</dl>
				<Button
					type="button"
					variant="destructive"
					size="sm"
					onClick={onDeleteOrphans}
					disabled={deleteOrphansDisabled || !summary || summary.orphanCount === 0 || summary.truncated}
				>
					<Trash2 className="size-3.5" />
					{m.admin_storage_delete_orphans()}
				</Button>
			</div>
			{summary?.truncated && (
				<p className="text-xs text-amber-600 dark:text-amber-400">
					{m.admin_storage_truncated({ count: formatNumber(summary.totalCount) })}
				</p>
			)}
		</div>
	)
}

export function StorageFilterPills({ active, onChange }: { active: StorageBrowserFilter; onChange: (next: StorageBrowserFilter) => void }) {
	const filters: Array<{ value: StorageBrowserFilter; label: string }> = [
		{ value: 'all', label: m.admin_storage_filter_all() },
		{ value: 'avatars', label: m.admin_storage_filter_avatars() },
		{ value: 'items', label: m.admin_storage_filter_items() },
		{ value: 'purchases', label: m.admin_storage_filter_purchases() },
		{ value: 'orphans', label: m.admin_storage_filter_orphans() },
	]
	return (
		<div className="flex flex-wrap items-center gap-2">
			{filters.map(f => (
				<Button
					key={f.value}
					type="button"
					variant={active === f.value ? 'default' : 'outline'}
					size="xs"
					className="uppercase tracking-wide"
					onClick={() => onChange(f.value)}
				>
					{f.label}
				</Button>
			))}
		</div>
	)
}

export function StorageTable({ rows, onDelete }: { rows: Array<StorageObjectRow>; onDelete?: (row: StorageObjectRow) => void }) {
	const [previewRow, setPreviewRow] = useState<StorageObjectRow | null>(null)

	if (rows.length === 0) {
		return <div className="text-sm text-muted-foreground italic">{m.admin_storage_empty()}</div>
	}
	return (
		<>
			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-17">{m.admin_storage_col_preview()}</TableHead>
							<TableHead>{m.admin_storage_col_kind()}</TableHead>
							<TableHead>{m.admin_storage_col_connected()}</TableHead>
							<TableHead>{m.admin_storage_col_owner()}</TableHead>
							<TableHead className="whitespace-nowrap">{m.admin_storage_col_uploaded()}</TableHead>
							<TableHead className="whitespace-nowrap text-right">{m.admin_storage_size()}</TableHead>
							<TableHead className="w-15 text-right">
								<span className="sr-only">{m.admin_storage_col_actions()}</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map(row => (
							<StorageTableRow key={row.key} row={row} onDelete={onDelete} onPreview={setPreviewRow} />
						))}
					</TableBody>
				</Table>
			</div>
			<Dialog open={previewRow !== null} onOpenChange={open => !open && setPreviewRow(null)}>
				<DialogContent className="sm:max-w-3xl">
					<DialogTitle className="font-mono text-xs break-all">{previewRow?.key}</DialogTitle>
					{previewRow?.url && (
						<img src={previewRow.url} alt={previewRow.key} className="max-h-[70vh] w-full rounded border bg-muted object-contain" />
					)}
				</DialogContent>
			</Dialog>
		</>
	)
}

function StorageTableRow({
	row,
	onDelete,
	onPreview,
}: {
	row: StorageObjectRow
	onDelete?: (row: StorageObjectRow) => void
	onPreview?: (row: StorageObjectRow) => void
}) {
	const isPdf = row.key.toLowerCase().endsWith('.pdf')
	return (
		<TableRow>
			<TableCell>
				{row.url === null ? (
					<div
						className="flex size-12 items-center justify-center rounded border bg-muted text-muted-foreground"
						title={m.admin_storage_private_receipt_title({ key: row.key })}
						aria-label={m.admin_storage_private_receipt()}
					>
						<Lock className="size-5" />
					</div>
				) : isPdf ? (
					<a
						href={row.url}
						target="_blank"
						rel="noopener noreferrer"
						className="flex size-12 items-center justify-center rounded border bg-muted text-muted-foreground hover:text-foreground"
						title={row.key}
					>
						<FileText className="size-5" />
					</a>
				) : (
					<button
						type="button"
						onClick={() => onPreview?.(row)}
						className="block size-12 overflow-hidden rounded border bg-muted transition-opacity hover:opacity-80"
						title={row.key}
					>
						<img src={row.url} alt={row.key} loading="lazy" className="size-full object-cover" />
					</button>
				)}
			</TableCell>
			<TableCell>
				<div className="flex flex-col gap-1">
					<Badge variant={row.kind === 'unknown' ? 'secondary' : 'outline'} className="capitalize">
						{storageKindLabel(row.kind)}
					</Badge>
					<StatusBadge status={row.status} />
				</div>
			</TableCell>
			<TableCell className="text-xs">
				<ConnectedCell row={row} />
			</TableCell>
			<TableCell className="text-xs">
				{row.owner ? (
					<div className="flex flex-col">
						<span className="truncate">{row.owner.name ?? m.admin_storage_owner_no_name()}</span>
						<span className="truncate text-muted-foreground">{row.owner.email}</span>
					</div>
				) : (
					<span className="italic text-muted-foreground">{m.admin_storage_owner_unknown()}</span>
				)}
			</TableCell>
			<TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums" title={formatDateTime(row.lastModified)}>
				{formatWhen(row.lastModified)}
			</TableCell>
			<TableCell className="whitespace-nowrap text-right text-xs tabular-nums">{formatBytes(row.size)}</TableCell>
			<TableCell className="text-right">
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label={m.admin_storage_delete_row({ key: row.key })}
					title={row.status === 'attached' ? m.admin_storage_delete_blocked_title() : m.admin_storage_delete_title()}
					onClick={() => onDelete?.(row)}
				>
					<Trash2 className={cn('size-4', row.status === 'orphan' && 'text-destructive')} />
				</Button>
			</TableCell>
		</TableRow>
	)
}

function StatusBadge({ status }: { status: StorageObjectRow['status'] }) {
	if (status === 'attached') return <Badge variant="outline">{m.admin_storage_status_attached()}</Badge>
	if (status === 'orphan') return <Badge variant="destructive">{m.admin_storage_status_orphan()}</Badge>
	return <Badge variant="secondary">{m.admin_storage_status_unknown()}</Badge>
}

function ConnectedCell({ row }: { row: StorageObjectRow }) {
	if (!row.target) {
		return <span className="italic text-muted-foreground">{NONE}</span>
	}
	if (row.target.kind === 'user') {
		return (
			<Link
				to="/admin/user/$id"
				params={{ id: row.target.id }}
				className="underline decoration-dotted underline-offset-3 hover:text-foreground"
			>
				{row.target.label}
			</Link>
		)
	}
	if (row.target.kind === 'purchase') {
		if (row.target.deleted) {
			return (
				<span className="italic text-muted-foreground">
					<RichMessage
						parts={m.admin_storage_target_deleted.parts({ label: row.target.label })}
						tags={{ mark: c => <span className="not-italic text-destructive">{c}</span> }}
					/>
				</span>
			)
		}
		return (
			<div className="flex flex-col">
				<div className="flex items-center gap-1.5">
					<Badge variant="outline" className="text-3xs uppercase tracking-wide">
						{row.target.purchaseKind === 'claim' ? m.admin_storage_purchase_kind_claim() : m.admin_storage_purchase_kind_addon()}
					</Badge>
					<span className="truncate" title={row.target.label}>
						{row.target.label}
					</span>
				</div>
				{row.target.gifterName && (
					<span className="truncate text-muted-foreground">{m.admin_storage_by_gifter({ name: row.target.gifterName })}</span>
				)}
			</div>
		)
	}
	if (row.target.deleted) {
		return (
			<span className="italic text-muted-foreground">
				<RichMessage
					parts={m.admin_storage_target_deleted.parts({ label: row.target.label })}
					tags={{ mark: c => <span className="not-italic text-destructive">{c}</span> }}
				/>
			</span>
		)
	}
	return (
		<div className="flex flex-col">
			<span className="truncate" title={row.target.label}>
				{row.target.label}
			</span>
			{row.target.listName && (
				<span className="truncate text-muted-foreground">{m.admin_storage_in_list({ listName: row.target.listName })}</span>
			)}
		</div>
	)
}

// What kind of object a row is, as shown in its badge and in the delete
// confirmation.
function storageKindLabel(kind: StorageObjectRow['kind']): string {
	switch (kind) {
		case 'avatar':
			return m.admin_storage_kind_avatar()
		case 'item':
			return m.admin_storage_kind_item()
		case 'purchase':
			return m.admin_storage_kind_purchase()
		case 'unknown':
			return m.admin_storage_kind_unknown()
	}
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return m.admin_storage_bytes_b({ value: formatNumber(0) })
	const k = 1024
	const units = [m.admin_storage_bytes_b, m.admin_storage_bytes_kb, m.admin_storage_bytes_mb, m.admin_storage_bytes_gb]
	const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
	const amount = bytes / Math.pow(k, i)
	const value =
		amount < 10 && i > 0
			? formatNumber(amount, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
			: formatNumber(Math.round(amount), { useGrouping: false })
	return units[i]({ value })
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

export function formatWhen(d: Date): string {
	const date = typeof d === 'string' ? new Date(d) : d
	const ageSec = (Date.now() - date.getTime()) / 1000
	if (ageSec < 60) return m.admin_storage_ago_seconds({ count: Math.max(1, Math.floor(ageSec)) })
	if (ageSec < 60 * 60) return m.admin_storage_ago_minutes({ count: Math.floor(ageSec / 60) })
	if (ageSec < 60 * 60 * 24) return m.admin_storage_ago_hours({ count: Math.floor(ageSec / 3600) })
	return formatDate(date, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	})
}
