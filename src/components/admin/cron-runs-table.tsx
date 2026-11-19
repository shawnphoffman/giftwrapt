import { useQuery } from '@tanstack/react-query'
import { type ColumnDef, flexRender, getCoreRowModel, type PaginationState, useReactTable } from '@tanstack/react-table'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getCronRunsAsAdmin } from '@/api/admin-cron'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TapTooltip, TapTooltipContent, TapTooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import type { CronRun } from '@/db/schema'
import { cronRunStatusEnumValues } from '@/db/schema'
import { CRON_ENDPOINTS, cronJobLabel, cronJobLabelOrPath } from '@/lib/cron/registry'
import { dateFnsLocale, formatDate, formatTimeAgo } from '@/lib/i18n/format'
import { m } from '@/paraglide/messages.js'

const STATUS_OPTIONS = ['all', ...cronRunStatusEnumValues] as const

function cronStatusLabel(status: CronRun['status']): string {
	switch (status) {
		case 'running':
			return m.admin_settings_cron_status_running()
		case 'success':
			return m.admin_settings_cron_status_success()
		case 'error':
			return m.admin_settings_cron_status_error()
		case 'skipped':
			return m.admin_settings_cron_status_skipped()
	}
}

function StatusBadge({ status }: { status: CronRun['status'] }) {
	const variant = {
		running: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
		success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
		error: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
		skipped: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
	}[status]
	return (
		<Badge variant="outline" className={variant}>
			{cronStatusLabel(status)}
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
		return (
			<span className="text-xs text-red-500 font-mono break-all line-clamp-2">
				{run.error ?? m.admin_settings_cron_runs_no_error_message()}
			</span>
		)
	}
	if (run.status === 'skipped') {
		return (
			<span className="text-xs text-amber-600 dark:text-amber-400">
				{run.skipReason
					? m.admin_settings_cron_runs_skipped_reason({ reason: run.skipReason })
					: m.admin_settings_cron_runs_skipped_unknown()}
			</span>
		)
	}
	if (run.status === 'running') {
		return <span className="text-xs text-muted-foreground">{m.admin_settings_cron_runs_running()}</span>
	}
	if (!run.summary || typeof run.summary !== 'object') return <span className="text-xs text-muted-foreground">—</span>
	const entries = Object.entries(run.summary as Record<string, unknown>).filter(
		([k, v]) => k !== 'ok' && k !== 'date' && k !== 'durationMs' && v != null && v !== ''
	)
	if (entries.length === 0) return <span className="text-xs text-muted-foreground">{m.admin_settings_cron_runs_ok()}</span>
	return (
		<TooltipProvider>
			<TapTooltip>
				<TapTooltipTrigger asChild>
					<div className="text-xs font-mono line-clamp-2 max-w-md">
						{entries
							.slice(0, 4)
							.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
							.join(' · ')}
					</div>
				</TapTooltipTrigger>
				<TapTooltipContent className="max-w-lg">
					<pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(run.summary, null, 2)}</pre>
				</TapTooltipContent>
			</TapTooltip>
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
				header: () => m.admin_settings_cron_runs_started_column(),
				cell: ({ row }) => {
					const d = new Date(row.original.startedAt)
					return (
						<TooltipProvider>
							<TapTooltip>
								<TapTooltipTrigger className="text-left">
									<div className="flex flex-col">
										<span className="text-xs font-medium">{formatTimeAgo(d)}</span>
										{/* eslint-disable-next-line i18next/no-literal-string -- date-fns pattern */}
										<span className="text-xs text-muted-foreground">{format(d, 'MMM d HH:mm:ss', { locale: dateFnsLocale() })}</span>
									</div>
								</TapTooltipTrigger>
								<TapTooltipContent>
									{formatDate(d, {
										year: 'numeric',
										month: 'numeric',
										day: 'numeric',
										hour: 'numeric',
										minute: '2-digit',
										second: '2-digit',
									})}
								</TapTooltipContent>
							</TapTooltip>
						</TooltipProvider>
					)
				},
			},
			{
				accessorKey: 'endpoint',
				header: () => m.admin_settings_cron_runs_endpoint_column(),
				cell: ({ row }) => (
					<div className="flex flex-col">
						<span className="text-xs font-medium">{cronJobLabelOrPath(row.original.endpoint)}</span>
						<code className="text-3xs text-muted-foreground">{row.original.endpoint}</code>
					</div>
				),
			},
			{
				accessorKey: 'status',
				header: () => m.admin_settings_cron_runs_status_column(),
				cell: ({ row }) => <StatusBadge status={row.original.status} />,
			},
			{
				accessorKey: 'durationMs',
				header: () => m.admin_settings_cron_runs_duration_column(),
				cell: ({ row }) => <span className="text-xs font-mono">{formatDuration(row.original.durationMs)}</span>,
			},
			{
				id: 'summary',
				header: () => m.admin_settings_cron_runs_result_column(),
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
					<SelectTrigger className="w-65">
						<SelectValue placeholder={m.admin_settings_cron_runs_endpoint_column()} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{m.admin_settings_cron_runs_all_endpoints()}</SelectItem>
						{CRON_ENDPOINTS.map(path => (
							<SelectItem key={path} value={path}>
								{cronJobLabel(path)}
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
					<SelectTrigger className="w-40">
						<SelectValue placeholder={m.admin_settings_cron_runs_status_column()} />
					</SelectTrigger>
					<SelectContent>
						{STATUS_OPTIONS.map(s => (
							<SelectItem key={s} value={s}>
								{s === 'all' ? m.admin_settings_cron_runs_all_statuses() : cronStatusLabel(s)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={String(pagination.pageSize)} onValueChange={v => setPagination(() => ({ pageIndex: 0, pageSize: Number(v) }))}>
					<SelectTrigger className="w-27.5">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{[25, 50, 100, 200].map(s => (
							<SelectItem key={s} value={String(s)}>
								{m.admin_settings_cron_runs_page_size({ count: s })}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="ml-auto text-xs text-muted-foreground">
					{isFetching ? m.admin_settings_cron_runs_updating() : m.admin_settings_cron_runs_range({ start: pageStart, end: pageEnd, total })}
				</div>
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
									{m.admin_settings_cron_runs_empty()}
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
					{m.admin_settings_cron_runs_page_of({ page: pagination.pageIndex + 1, total: Math.max(1, table.getPageCount()) })}
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
