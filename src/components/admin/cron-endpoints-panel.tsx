import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CronExpressionParser } from 'cron-parser'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle2, Clock, Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'

import { getCronEndpointsSummaryAsAdmin, runCronAsAdmin } from '@/api/admin-cron'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CronEndpoint } from '@/lib/cron/registry'
import { cn } from '@/lib/utils'

function nextFireFromSchedule(schedule: string): Date | null {
	try {
		return CronExpressionParser.parse(schedule).next().toDate()
	} catch {
		return null
	}
}

function relativeOrDash(d: Date | string | null) {
	if (!d) return '—'
	const date = typeof d === 'string' ? new Date(d) : d
	return formatDistanceToNow(date, { addSuffix: true })
}

function RunNowButton({ endpoint, label }: { endpoint: CronEndpoint; label: string }) {
	const qc = useQueryClient()
	const mutation = useMutation({
		mutationFn: () => runCronAsAdmin({ data: { endpoint } }),
		onSuccess: result => {
			if (result.ok) {
				const summary = result.result as Record<string, unknown>
				if ('skipped' in summary) {
					toast.info(`${label}: skipped (${String(summary.skipped)})`)
				} else {
					toast.success(`${label} completed`)
				}
			} else if (result.reason === 'already-running') {
				toast.warning(`${label} is already running`)
			} else {
				toast.error(`${label} failed: ${result.error ?? 'unknown error'}`)
			}
			qc.invalidateQueries({ queryKey: ['admin', 'cron'] })
		},
		onError: err => {
			toast.error(`${label} failed: ${err instanceof Error ? err.message : String(err)}`)
		},
	})

	return (
		<Button
			size="sm"
			variant="outline"
			className="h-7 px-2 text-xs"
			disabled={mutation.isPending}
			onClick={() => mutation.mutate()}
			aria-label={`Run ${label} now`}
		>
			{mutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
			Run now
		</Button>
	)
}

export function CronEndpointsPanel() {
	const { data, isLoading } = useQuery({
		queryKey: ['admin', 'cron', 'endpoints-summary'],
		queryFn: () => getCronEndpointsSummaryAsAdmin(),
		refetchInterval: 30_000,
	})

	if (isLoading || !data) {
		return (
			<div className="space-y-2">
				{[...Array(5)].map((_, i) => (
					<Skeleton key={i} className="h-14 w-full" />
				))}
			</div>
		)
	}

	return (
		<TooltipProvider>
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="border-b text-left text-xs uppercase text-muted-foreground">
						<tr>
							<th className="py-2 pr-3 font-medium">Endpoint</th>
							<th className="py-2 pr-3 font-medium">Schedule</th>
							<th className="py-2 pr-3 font-medium">Last run</th>
							<th className="py-2 pr-3 font-medium">Last success</th>
							<th className="py-2 pr-3 font-medium">Next fire</th>
							<th className="py-2 pr-3 font-medium text-right">24h</th>
							<th className="py-2 pr-3 font-medium text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{data.map(entry => {
							const next = nextFireFromSchedule(entry.schedule)
							const stale =
								entry.lastSuccessAt &&
								Date.now() - new Date(entry.lastSuccessAt).getTime() > parseInterval(entry.schedule, entry.cadence) * 3
							const errs = entry.errorsLast24h
							return (
								<tr key={entry.path} className="border-b last:border-0 align-top">
									<td className="py-3 pr-3">
										<div className="flex flex-col">
											<span className="font-medium">{entry.label}</span>
											<code className="text-xs text-muted-foreground">{entry.path}</code>
											<span className="text-xs text-muted-foreground">{entry.description}</span>
										</div>
									</td>
									<td className="py-3 pr-3">
										<div className="flex flex-col">
											<code className="text-xs">{entry.schedule}</code>
											<span className="text-xs text-muted-foreground">{entry.cadence}</span>
										</div>
									</td>
									<td className="py-3 pr-3 text-xs">
										{entry.lastRunAt ? (
											<Tooltip>
												<TooltipTrigger className="text-left">{relativeOrDash(entry.lastRunAt)}</TooltipTrigger>
												<TooltipContent>{new Date(entry.lastRunAt).toLocaleString()}</TooltipContent>
											</Tooltip>
										) : (
											<span className="text-muted-foreground">never</span>
										)}
									</td>
									<td className="py-3 pr-3 text-xs">
										<div className={cn('flex items-center gap-1', stale && 'text-amber-600 dark:text-amber-400')}>
											{entry.lastSuccessAt ? (
												<>
													{stale ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3 text-emerald-500" />}
													<Tooltip>
														<TooltipTrigger className="text-left">{relativeOrDash(entry.lastSuccessAt)}</TooltipTrigger>
														<TooltipContent>{new Date(entry.lastSuccessAt).toLocaleString()}</TooltipContent>
													</Tooltip>
												</>
											) : (
												<span className="text-muted-foreground">never</span>
											)}
										</div>
									</td>
									<td className="py-3 pr-3 text-xs">
										{next ? (
											<div className="flex items-center gap-1">
												<Clock className="size-3 text-muted-foreground" />
												<Tooltip>
													<TooltipTrigger className="text-left">{relativeOrDash(next)}</TooltipTrigger>
													<TooltipContent>{next.toLocaleString()}</TooltipContent>
												</Tooltip>
											</div>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</td>
									<td className="py-3 pr-3 text-right text-xs">
										<div className="flex items-center justify-end gap-2">
											<span className="text-muted-foreground">{entry.runsLast24h}</span>
											{errs > 0 && (
												<span className="text-red-500 font-medium" title="errors in last 24h">
													{errs} err
												</span>
											)}
										</div>
									</td>
									<td className="py-3 pr-3 text-right">
										<RunNowButton endpoint={entry.path} label={entry.label} />
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
		</TooltipProvider>
	)
}

// Rough interval-in-ms estimate for the staleness check. Falls back to
// the human cadence string (which we control via the registry).
function parseInterval(schedule: string, cadence: string): number {
	try {
		const it = CronExpressionParser.parse(schedule)
		const a = it.next().toDate().getTime()
		const b = it.next().toDate().getTime()
		return Math.max(60_000, b - a)
	} catch {
		const m = cadence.match(/(\d+)\s*minute/i)
		if (m) return Number(m[1]) * 60_000
		if (/hourly/i.test(cadence)) return 60 * 60_000
		return 24 * 60 * 60_000
	}
}
