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
import { m } from '@/paraglide/messages.js'

import { type StorageBrowserFilter, StorageFilterPills, StorageSummaryBar, StorageTable } from './storage-browser-view'

function deleteConfirmTitle(kind: StorageObjectRow['kind']): string {
	switch (kind) {
		case 'avatar':
			return m.admin_storage_delete_confirm_title_avatar()
		case 'item':
			return m.admin_storage_delete_confirm_title_item()
		case 'purchase':
			return m.admin_storage_delete_confirm_title_purchase()
		case 'unknown':
			return m.admin_storage_delete_confirm_title_unknown()
	}
}

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

	const prefix = filter === 'avatars' ? 'avatars/' : filter === 'items' ? 'items/' : filter === 'purchases' ? 'purchases/' : undefined

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
					toast.error(m.admin_storage_bulk_too_large())
					return
				}
				setBulkDialogOpen(true)
			},
			onError: () => toast.error(m.admin_storage_count_failed()),
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

			{listQuery.isLoading && <div className="text-sm text-muted-foreground">{m.admin_storage_loading()}</div>}
			{listQuery.data?.kind === 'error' && <div className="text-sm text-destructive">{m.admin_storage_not_configured_server()}</div>}

			{listQuery.data?.kind === 'ok' && <StorageTable rows={visibleRows} onDelete={setRowToDelete} />}

			<div className="flex items-center gap-2">
				<Button type="button" variant="outline" size="sm" disabled={cursorStack.length <= 1} onClick={goPrev}>
					{m.admin_storage_page_previous()}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={listQuery.data?.kind !== 'ok' || !listQuery.data.nextCursor}
					onClick={goNext}
				>
					{m.admin_storage_page_next()}
				</Button>
				<span className="text-xs text-muted-foreground">{m.admin_storage_page({ page: cursorStack.length })}</span>
			</div>

			<ConfirmDialog
				open={bulkDialogOpen}
				onOpenChange={setBulkDialogOpen}
				destructive
				title={m.admin_storage_bulk_title()}
				description={dryRunCount === null ? m.state_loading() : m.admin_storage_bulk_description({ count: dryRunCount })}
				confirmLabel={m.admin_storage_bulk_confirm()}
				confirmBusyLabel={m.admin_storage_deleting()}
				onConfirm={async () => {
					const result = await deleteOrphansAsAdmin({ data: {} })
					if (result.kind === 'error') {
						toast.error(m.admin_storage_not_configured())
						throw new Error('not-configured')
					}
					toast.success(
						result.failed
							? m.admin_storage_bulk_done_failed({ count: result.deleted, failed: result.failed })
							: m.admin_storage_bulk_done({ count: result.deleted })
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
				title={rowToDelete ? deleteConfirmTitle(rowToDelete.kind) : ''}
				description={
					rowToDelete && (
						<>
							<span className="font-mono text-xs break-all">{rowToDelete.key}</span>
							<br />
							<br />
							{rowToDelete.status === 'attached' ? m.admin_storage_delete_confirm_attached() : m.admin_storage_delete_confirm_orphan()}
						</>
					)
				}
				confirmLabel={m.action_delete()}
				confirmBusyLabel={m.admin_storage_deleting()}
				onConfirm={async () => {
					if (!rowToDelete) return
					const result = await deleteStorageObjectAsAdmin({ data: { key: rowToDelete.key } })
					if (result.kind === 'error') {
						const msg =
							result.reason === 'in-use'
								? m.admin_storage_delete_in_use()
								: result.reason === 'not-found'
									? m.admin_storage_delete_not_found()
									: m.admin_storage_not_configured()
						toast.error(msg)
						throw new Error(result.reason)
					}
					toast.success(m.admin_storage_deleted())
					setRowToDelete(null)
					await invalidate()
				}}
			/>
		</div>
	)
}
