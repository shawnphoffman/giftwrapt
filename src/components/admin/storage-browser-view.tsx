import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { StorageObjectRow, StorageSummary } from '@/api/admin-storage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

// Pure presentational pieces of /admin/storage. No data fetching, no
// dialogs - everything is prop-driven so Storybook fixtures can exercise
// the layout, badges, and empty/loading states without standing up a
// QueryClient cache.

export type StorageBrowserFilter = 'all' | 'avatars' | 'items' | 'orphans'

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
				<dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
					<dt className="text-xs uppercase tracking-wide text-muted-foreground">Objects</dt>
					<dt className="text-xs uppercase tracking-wide text-muted-foreground">Size</dt>
					<dt className="text-xs uppercase tracking-wide text-muted-foreground">Orphans</dt>
					<dd className="font-mono tabular-nums">{loading ? '…' : (summary?.totalCount.toLocaleString() ?? '–')}</dd>
					<dd className="font-mono tabular-nums">{loading ? '…' : summary ? formatBytes(summary.totalBytes) : '–'}</dd>
					<dd className="font-mono tabular-nums">
						{loading ? '…' : summary ? `${summary.orphanCount.toLocaleString()} (${formatBytes(summary.orphanBytes)})` : '–'}
					</dd>
				</dl>
				<Button
					type="button"
					variant="destructive"
					size="sm"
					onClick={onDeleteOrphans}
					disabled={deleteOrphansDisabled || !summary || summary.orphanCount === 0 || summary.truncated}
				>
					<Trash2 className="size-3.5" />
					Delete all orphans
				</Button>
			</div>
			{summary?.truncated && (
				<p className="text-xs text-amber-600 dark:text-amber-400">
					Bucket scan stopped at the {summary.totalCount.toLocaleString()}-object cap; counts above don't include the rest. Bulk-delete is
					disabled while truncated.
				</p>
			)}
		</div>
	)
}

export function StorageFilterPills({ active, onChange }: { active: StorageBrowserFilter; onChange: (next: StorageBrowserFilter) => void }) {
	const filters: Array<{ value: StorageBrowserFilter; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'avatars', label: 'Avatars' },
		{ value: 'items', label: 'Items' },
		{ value: 'orphans', label: 'Orphans' },
	]
	return (
		<div className="flex flex-wrap items-center gap-2">
			{filters.map(f => (
				<Button
					key={f.value}
					type="button"
					variant={active === f.value ? 'default' : 'outline'}
					size="sm"
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
		return <div className="text-sm text-muted-foreground italic">No objects to show.</div>
	}
	return (
		<>
			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[68px]">Preview</TableHead>
							<TableHead>Kind</TableHead>
							<TableHead>Connected</TableHead>
							<TableHead>Owner</TableHead>
							<TableHead className="whitespace-nowrap">Uploaded</TableHead>
							<TableHead className="whitespace-nowrap text-right">Size</TableHead>
							<TableHead className="w-[60px] text-right">
								<span className="sr-only">Actions</span>
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
					{previewRow && (
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
	return (
		<TableRow>
			<TableCell>
				<button
					type="button"
					onClick={() => onPreview?.(row)}
					className="block size-12 overflow-hidden rounded border bg-muted transition-opacity hover:opacity-80"
					title={row.key}
				>
					<img src={row.url} alt={row.key} loading="lazy" className="size-full object-cover" />
				</button>
			</TableCell>
			<TableCell>
				<div className="flex flex-col gap-1">
					<Badge variant={row.kind === 'unknown' ? 'secondary' : 'outline'} className="capitalize">
						{row.kind}
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
						<span className="truncate">{row.owner.name ?? '(no name)'}</span>
						<span className="truncate text-muted-foreground">{row.owner.email}</span>
					</div>
				) : (
					<span className="italic text-muted-foreground">unknown</span>
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
					aria-label={`Delete ${row.key}`}
					title={row.status === 'attached' ? 'Cannot delete: still attached to a row' : 'Delete object'}
					onClick={() => onDelete?.(row)}
				>
					<Trash2 className={cn('size-4', row.status === 'orphan' && 'text-destructive')} />
				</Button>
			</TableCell>
		</TableRow>
	)
}

function StatusBadge({ status }: { status: StorageObjectRow['status'] }) {
	if (status === 'attached') return <Badge variant="outline">attached</Badge>
	if (status === 'orphan') return <Badge variant="destructive">orphan</Badge>
	return <Badge variant="secondary">unknown</Badge>
}

function ConnectedCell({ row }: { row: StorageObjectRow }) {
	if (!row.target) {
		return <span className="italic text-muted-foreground">–</span>
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
	if (row.target.deleted) {
		return (
			<span className="italic text-muted-foreground">
				{row.target.label} <span className="not-italic text-destructive">(deleted)</span>
			</span>
		)
	}
	return (
		<div className="flex flex-col">
			<span className="truncate" title={row.target.label}>
				{row.target.label}
			</span>
			{row.target.listName && <span className="truncate text-muted-foreground">in {row.target.listName}</span>}
		</div>
	)
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B'
	const k = 1024
	const sizes = ['B', 'KB', 'MB', 'GB']
	const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
	const value = bytes / Math.pow(k, i)
	return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${sizes[i]}`
}

export function formatDateTime(d: Date): string {
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

export function formatWhen(d: Date): string {
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
