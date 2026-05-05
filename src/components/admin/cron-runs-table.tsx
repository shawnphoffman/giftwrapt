import { useQuery } from '@tanstack/react-query'
import { type ColumnDef, flexRender, getCoreRowModel, type PaginationState, useReactTable } from '@tanstack/react-table'
import { format, formatDistanceToNow } from 'date-fns'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getCronRunsAsAdmin } from '@/api/admin-cron'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CronRun } from '@/db/schema'
import { cronRunStatusEnumValues } from '@/db/schema'
import { CRON_ENDPOINTS, getCronEntry } from '@/lib/cron/registry'

const STATUS_OPTIONS = ['all', ...cronRunStatusEnumValues] as const

function StatusBadge({ status }: { status: CronRun['status'] }) {
	const variant = {
		running: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
		success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
		error: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
		skipped: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
	}[status]
	return (
		<Badge variant="outline" className={variant}>
			{status}
		</Badge>
	)
}

function formatDuration(ms: number | null): string {
	if (ms == null) return '—'
	if (ms < 1000) return `${ms}ms`
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
	return `${(ms / 60_000).toFixed(1)}m`
}

function SummaryCell({ run }: { run: CronRun }) {
	if (run.status === 'error') {
		return <span className="text-xs text-red-500 font-mono break-all line-clamp-2">{run.error ?? '(no error message)'}</span>
	}
	if (run.status === 'skipped') {
		return <span className="text-xs text-amber-600 dark:text-amber-400">skipped: {run.skipReason ?? 'unknown'}</span>
	}
	if (run.status === 'running') {
		return <span className="text-xs text-muted-foreground">running…</span>
	}
	if (!run.summary || typeof run.summary !== 'object') return <span className="text-xs text-muted-foreground">—</span>
	const entries = Object.entries(run.summary as Record<string, unknown>).filter(
		([k, v]) => k !== 'ok' && k !== 'date' && k !== 'durationMs' && v != null && v !== ''
	)
	if (entries.length === 0) return <span className="text-xs text-muted-foreground">ok</span>
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="text-xs font-mono line-clamp-2 max-w-md">
						{entries
							.slice(0, 4)
							.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
							.join(' · ')}
					</div>
				</TooltipTrigger>
				<TooltipContent className="max-w-lg">
					<pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(run.summary, null, 2)}</pre>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}

export function CronRunsTable() {
	const [endpoint, setEndpoint] = useState<'all' | (typeof CRON_ENDPOINTS)[number]>('all')
	const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>('all')
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 })

	const { data, isLoading, isFetching } = useQuery({
		queryKey: ['admin', 'cron', 'runs', endpoint, status, pagination.pageIndex, pagination.pageSize],
		queryFn: () =>
			getCronRunsAsAdmin({
				data: { endpoint, status, pageIndex: pagination.pageIndex, pageSize: pagination.pageSize },
			}),
		refetchInterval: 30_000,
	})

	const columns = useMemo<Array<ColumnDef<CronRun>>>(
		() => [
			{
				accessorKey: 'startedAt',
				header: 'Started',
				cell: ({ row }) => {
					const d = new Date(row.original.startedAt)
					return (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger className="text-left">
									<div className="flex flex-col">
										<span className="text-xs font-medium">{formatDistanceToNow(d, { addSuffix: true })}</span>
										<span className="text-xs text-muted-foreground">{format(d, 'MMM d HH:mm:ss')}</span>
									</div>
								</TooltipTrigger>
								<TooltipContent>{d.toLocaleString()}</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)
				},
			},
			{
				accessorKey: 'endpoint',
				header: 'Endpoint',
				cell: ({ row }) => {
					const entry = getCronEntry(row.original.endpoint)
					return (
						<div className="flex flex-col">
							<span className="text-xs font-medium">{entry?.label ?? row.original.endpoint}</span>
							<code className="text-[10px] text-muted-foreground">{row.original.endpoint}</code>
						</div>
					)
				},
			},
			{
				accessorKey: 'status',
				header: 'Status',
				cell: ({ row }) => <StatusBadge status={row.original.status} />,
			},
			{
				accessorKey: 'durationMs',
				header: 'Duration',
				cell: ({ row }) => <span className="text-xs font-mono">{formatDuration(row.original.durationMs)}</span>,
			},
			{
				id: 'summary',
				header: 'Result',
				cell: ({ row }) => <SummaryCell run={row.original} />,
			},
		],
		[]
	)

	const table = useReactTable({
		data: data?.rows ?? [],
		columns,
		getCoreRowModel: getCoreRowModel(),
		manualPagination: true,
		pageCount: data ? Math.max(1, Math.ceil(data.total / pagination.pageSize)) : -1,
		state: { pagination },
		onPaginationChange: setPagination,
	})

	const total = data?.total ?? 0
	const pageStart = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
	const pageEnd = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize)

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<Select
					value={endpoint}
					onValueChange={v => {
						setEndpoint(v as typeof endpoint)
						setPagination(p => ({ ...p, pageIndex: 0 }))
					}}
				>
					<SelectTrigger className="w-[260px]">
						<SelectValue placeholder="Endpoint" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All endpoints</SelectItem>
						{CRON_ENDPOINTS.map(path => (
							<SelectItem key={path} value={path}>
								{getCronEntry(path)?.label ?? path}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={status}
					onValueChange={v => {
						setStatus(v as typeof status)
						setPagination(p => ({ ...p, pageIndex: 0 }))
					}}
				>
					<SelectTrigger className="w-[160px]">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						{STATUS_OPTIONS.map(s => (
							<SelectItem key={s} value={s}>
								{s === 'all' ? 'All statuses' : s}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={String(pagination.pageSize)} onValueChange={v => setPagination(p => ({ pageIndex: 0, pageSize: Number(v) }))}>
					<SelectTrigger className="w-[110px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{[25, 50, 100, 200].map(s => (
							<SelectItem key={s} value={String(s)}>
								{s} / page
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="ml-auto text-xs text-muted-foreground">{isFetching ? 'updating…' : `${pageStart}–${pageEnd} of ${total}`}</div>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map(hg => (
							<TableRow key={hg.id}>
								{hg.headers.map(h => (
									<TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{isLoading ? (
							[...Array(5)].map((_, i) => (
								<TableRow key={i}>
									{columns.map((_c, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : table.getRowModel().rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={columns.length} className="text-center text-sm text-muted-foreground py-8">
									No cron runs match the current filters.
								</TableCell>
							</TableRow>
						) : (
							table.getRowModel().rows.map(row => (
								<TableRow key={row.id}>
									{row.getVisibleCells().map(cell => (
										<TableCell key={cell.id} className="align-top">
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</TableCell>
									))}
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-end gap-2">
				<Button variant="outline" size="icon" onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()}>
					<ChevronsLeft className="size-4" />
				</Button>
				<Button variant="outline" size="icon" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
					<ChevronLeft className="size-4" />
				</Button>
				<span className="text-xs tabular-nums">
					Page {pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
				</span>
				<Button variant="outline" size="icon" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
					<ChevronRight className="size-4" />
				</Button>
				<Button variant="outline" size="icon" onClick={() => table.lastPage()} disabled={!table.getCanNextPage()}>
					<ChevronsRight className="size-4" />
				</Button>
			</div>
		</div>
	)
}
