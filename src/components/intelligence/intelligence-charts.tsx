// Lazy-loaded chart island for the admin intelligence page. Holds the
// recharts imports + the shared ChartContainer (which drags recharts in
// transitively). Splitting the charts off keeps ~350 KB of recharts off
// the static graph for /admin/intelligence and its sibling tabs.

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatCurrency, formatDate, formatNumber } from '@/lib/i18n/format'
import { m } from '@/paraglide/messages.js'

import type { DailySeriesPoint } from './__fixtures__/types'

function compactNumber(n: number): string {
	if (n >= 1000) return `${formatNumber(n / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })}k`
	return formatNumber(n, { useGrouping: false, maximumFractionDigits: 20 })
}

function shortDate(iso: string): string {
	return formatDate(iso, { month: 'numeric', day: 'numeric' })
}

function LegendDot({ color, label }: { color: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="size-2.5 rounded-sm" style={{ background: color }} />
			{label}
		</span>
	)
}

const RUNS_COLORS = {
	success: 'var(--color-emerald-500)',
	skipped: 'var(--color-cyan-500)',
	error: 'var(--color-rose-500)',
}

// Built on each render so the series names follow the page's language.
const runsChartConfig = (): ChartConfig => ({
	runsSuccess: { label: m.admin_intel_chart_series_success(), color: RUNS_COLORS.success },
	runsSkipped: { label: m.admin_intel_chart_series_skipped(), color: RUNS_COLORS.skipped },
	runsError: { label: m.admin_intel_chart_series_error(), color: RUNS_COLORS.error },
})

export function RunsActivityChart({ data }: { data: Array<DailySeriesPoint> }) {
	const total = data.reduce((s, d) => s + d.runsSuccess + d.runsSkipped + d.runsError, 0)
	return (
		<Card data-intelligence="admin-chart-runs">
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_intel_chart_runs_title()}</CardTitle>
				<CardDescription className="tabular-nums">{m.admin_intel_chart_runs_total({ count: total })}</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer config={runsChartConfig()} className="aspect-auto h-44 w-full">
					<BarChart accessibilityLayer data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
						<defs>
							<linearGradient id="fillRunsSuccess" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="var(--color-runsSuccess)" stopOpacity={1} />
								<stop offset="100%" stopColor="var(--color-runsSuccess)" stopOpacity={0.45} />
							</linearGradient>
							<linearGradient id="fillRunsSkipped" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="var(--color-runsSkipped)" stopOpacity={1} />
								<stop offset="100%" stopColor="var(--color-runsSkipped)" stopOpacity={0.45} />
							</linearGradient>
							<linearGradient id="fillRunsError" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="var(--color-runsError)" stopOpacity={1} />
								<stop offset="100%" stopColor="var(--color-runsError)" stopOpacity={0.45} />
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} strokeDasharray="3 3" />
						<XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={shortDate} fontSize={10} />
						<YAxis tickLine={false} axisLine={false} fontSize={10} width={28} />
						<ChartTooltip content={<ChartTooltipContent />} />
						<Bar dataKey="runsSuccess" stackId="r" fill="url(#fillRunsSuccess)" radius={[0, 0, 0, 0]} />
						<Bar dataKey="runsSkipped" stackId="r" fill="url(#fillRunsSkipped)" radius={[0, 0, 0, 0]} />
						<Bar dataKey="runsError" stackId="r" fill="url(#fillRunsError)" radius={[4, 4, 0, 0]} />
					</BarChart>
				</ChartContainer>
				<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
					<LegendDot color={RUNS_COLORS.success} label={m.admin_intel_chart_series_success()} />
					<LegendDot color={RUNS_COLORS.skipped} label={m.admin_intel_chart_series_skipped()} />
					<LegendDot color={RUNS_COLORS.error} label={m.admin_intel_chart_series_error()} />
				</div>
			</CardContent>
		</Card>
	)
}

const TOKENS_COLORS = {
	in: 'var(--color-fuchsia-500)',
	out: 'var(--color-amber-500)',
}

const tokensChartConfig = (): ChartConfig => ({
	tokensIn: { label: m.admin_intel_chart_series_in(), color: TOKENS_COLORS.in },
	tokensOut: { label: m.admin_intel_chart_series_out(), color: TOKENS_COLORS.out },
})

export function TokenUsageChart({ data }: { data: Array<DailySeriesPoint> }) {
	const totalCost = data.reduce((s, d) => s + d.costUsd, 0)
	return (
		<Card data-intelligence="admin-chart-tokens">
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_intel_chart_tokens_title()}</CardTitle>
				<CardDescription className="tabular-nums">
					{m.admin_intel_chart_cost_total({ cost: formatCurrency(totalCost, 'USD') })}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer config={tokensChartConfig()} className="aspect-auto h-44 w-full">
					<AreaChart accessibilityLayer data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
						<defs>
							<linearGradient id="fillIn" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="var(--color-tokensIn)" stopOpacity={0.6} />
								<stop offset="100%" stopColor="var(--color-tokensIn)" stopOpacity={0.05} />
							</linearGradient>
							<linearGradient id="fillOut" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="var(--color-tokensOut)" stopOpacity={0.6} />
								<stop offset="100%" stopColor="var(--color-tokensOut)" stopOpacity={0.05} />
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} strokeDasharray="3 3" />
						<XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={shortDate} fontSize={10} />
						<YAxis tickLine={false} axisLine={false} fontSize={10} width={36} tickFormatter={n => compactNumber(n as number)} />
						<ChartTooltip content={<ChartTooltipContent />} />
						<Area type="monotone" dataKey="tokensIn" stackId="t" stroke="var(--color-tokensIn)" fill="url(#fillIn)" strokeWidth={2} />
						<Area type="monotone" dataKey="tokensOut" stackId="t" stroke="var(--color-tokensOut)" fill="url(#fillOut)" strokeWidth={2} />
					</AreaChart>
				</ChartContainer>
				<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
					<LegendDot color={TOKENS_COLORS.in} label={m.admin_intel_chart_legend_input()} />
					<LegendDot color={TOKENS_COLORS.out} label={m.admin_intel_chart_legend_output()} />
				</div>
			</CardContent>
		</Card>
	)
}
