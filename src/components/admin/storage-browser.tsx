import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
	deleteOrphansAsAdmin,
	deleteStorageObjectAsAdmin,
	getStorageSummaryAsAdmin,
	listStorageObjectsAsAdmin,
	type StorageObjectRow,
	type StorageSummary,
} from '@/api/admin-storage'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'

import { type StorageBrowserFilter, StorageFilterPills, StorageSummaryBar, StorageTable } from './storage-browser-view'

// /admin/storage page body. Wires the pure view pieces in
// storage-browser-view.tsx to server fns: paginated list, summary stats,
// per-row delete, bulk orphan delete.

const STORAGE_QUERY_KEY = ['admin', 'storage'] as const

export function StorageBrowser() {
	const queryClient = useQueryClient()
	const [filter, setFilter] = useState<StorageBrowserFilter>('all')
	const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined])
	const cursor = cursorStack[cursorStack.length - 1]
	const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
	const [rowToDelete, setRowToDelete] = useState<StorageObjectRow | null>(null)

	const prefix = filter === 'avatars' ? 'avatars/' : filter === 'items' ? 'items/' : undefined

	const listQuery = useQuery({
		queryKey: [...STORAGE_QUERY_KEY, 'list', { prefix, cursor }],
		queryFn: () => listStorageObjectsAsAdmin({ data: { prefix, cursor } }),
	})

	const summaryQuery = useQuery({
		queryKey: [...STORAGE_QUERY_KEY, 'summary'],
		queryFn: () => getStorageSummaryAsAdmin(),
	})

	const summary: StorageSummary | null = summaryQuery.data?.kind === 'ok' ? summaryQuery.data.summary : null

	const visibleRows = useMemo(() => {
		if (listQuery.data?.kind !== 'ok') return []
		const rows = listQuery.data.objects
		if (filter === 'orphans') return rows.filter(r => r.status === 'orphan')
		return rows
	}, [listQuery.data, filter])

	function changeFilter(next: StorageBrowserFilter) {
		setFilter(next)
		setCursorStack([undefined])
	}

	function goNext() {
		if (listQuery.data?.kind !== 'ok' || !listQuery.data.nextCursor) return
		setCursorStack([...cursorStack, listQuery.data.nextCursor])
	}

	function goPrev() {
		if (cursorStack.length <= 1) return
		setCursorStack(cursorStack.slice(0, -1))
	}

	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: [...STORAGE_QUERY_KEY, 'list'] }),
			queryClient.invalidateQueries({ queryKey: [...STORAGE_QUERY_KEY, 'summary'] }),
		])

	const dryRun = useMutation({
		mutationFn: () => deleteOrphansAsAdmin({ data: { dryRun: true } }),
	})

	function openBulkDialog() {
		dryRun.mutate(undefined, {
			onSuccess: data => {
				if (data.kind === 'error' && data.reason === 'walk-truncated') {
					toast.error('Bucket is too large to bulk-delete from the UI. Run a one-shot script instead.')
					return
				}
				setBulkDialogOpen(true)
			},
			onError: () => toast.error('Failed to count orphans'),
		})
	}

	const dryRunCount = dryRun.data?.kind === 'ok' ? dryRun.data.orphanCount : null

	return (
		<div className="space-y-4">
			<StorageSummaryBar
				summary={summary}
				loading={summaryQuery.isLoading}
				deleteOrphansDisabled={dryRun.isPending}
				onDeleteOrphans={openBulkDialog}
			/>

			<StorageFilterPills active={filter} onChange={changeFilter} />

			{listQuery.isLoading && <div className="text-sm text-muted-foreground">Loading objects…</div>}
			{listQuery.data?.kind === 'error' && <div className="text-sm text-destructive">Storage is not configured on this server.</div>}

			{listQuery.data?.kind === 'ok' && <StorageTable rows={visibleRows} onDelete={setRowToDelete} />}

			<div className="flex items-center gap-2">
				<Button type="button" variant="outline" size="sm" disabled={cursorStack.length <= 1} onClick={goPrev}>
					Previous
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={listQuery.data?.kind !== 'ok' || !listQuery.data.nextCursor}
					onClick={goNext}
				>
					Next
				</Button>
				<span className="text-xs text-muted-foreground">Page {cursorStack.length}</span>
			</div>

			<ConfirmDialog
				open={bulkDialogOpen}
				onOpenChange={setBulkDialogOpen}
				destructive
				title="Delete All Orphans?"
				description={
					dryRunCount === null
						? 'Loading…'
						: `This will permanently delete ${dryRunCount} object${dryRunCount === 1 ? '' : 's'} from the bucket. This cannot be undone.`
				}
				confirmLabel="Delete orphans"
				confirmBusyLabel="Deleting…"
				onConfirm={async () => {
					const result = await deleteOrphansAsAdmin({ data: {} })
					if (result.kind === 'error') {
						toast.error('Storage is not configured.')
						throw new Error('not-configured')
					}
					toast.success(
						`Deleted ${result.deleted} orphan${result.deleted === 1 ? '' : 's'}${result.failed ? ` (${result.failed} failed)` : ''}`
					)
					await invalidate()
				}}
			/>

			<ConfirmDialog
				open={rowToDelete !== null}
				onOpenChange={open => {
					if (!open) setRowToDelete(null)
				}}
				destructive
				title={rowToDelete ? `Delete ${rowToDelete.kind} object?` : ''}
				description={
					rowToDelete && (
						<>
							<span className="font-mono text-xs break-all">{rowToDelete.key}</span>
							<br />
							<br />
							{rowToDelete.status === 'attached'
								? 'This object is still referenced by a database row. Deleting will leave that row pointing at a broken URL.'
								: 'This object is not referenced by any database row.'}
						</>
					)
				}
				confirmLabel="Delete"
				confirmBusyLabel="Deleting…"
				onConfirm={async () => {
					if (!rowToDelete) return
					const result = await deleteStorageObjectAsAdmin({ data: { key: rowToDelete.key } })
					if (result.kind === 'error') {
						const msg =
							result.reason === 'in-use'
								? 'Object is still referenced by a row.'
								: result.reason === 'not-found'
									? 'Object no longer exists.'
									: 'Storage is not configured.'
						toast.error(msg)
						throw new Error(result.reason)
					}
					toast.success('Object deleted')
					setRowToDelete(null)
					await invalidate()
				}}
			/>
		</div>
	)
}
