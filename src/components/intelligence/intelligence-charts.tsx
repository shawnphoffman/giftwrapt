// Lazy-loaded chart island for the admin intelligence page. Holds the
// recharts imports + the shared ChartContainer (which drags recharts in
// transitively). Splitting the charts off keeps ~350 KB of recharts off
// the static graph for /admin/intelligence and its sibling tabs.

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

import type { DailySeriesPoint } from './__fixtures__/types'

function formatNumber(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
	return n.toString()
}

function shortDate(iso: string): string {
	const d = new Date(iso)
	return `${d.getMonth() + 1}/${d.getDate()}`
}

function LegendDot({ color, label }: { color: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="size-2.5 rounded-sm" style={{ background: color }} />
			{label}
		</span>
	)
}

const runsChartConfig: ChartConfig = {
	runsSuccess: { label: 'Success', color: 'var(--color-emerald-500, oklch(0.7 0.17 162))' },
	runsSkipped: { label: 'Skipped', color: 'var(--color-muted-foreground, oklch(0.55 0 0))' },
	runsError: { label: 'Error', color: 'var(--color-destructive, oklch(0.6 0.22 22))' },
}

export function RunsActivityChart({ data }: { data: Array<DailySeriesPoint> }) {
	const total = data.reduce((s, d) => s + d.runsSuccess + d.runsSkipped + d.runsError, 0)
	return (
		<Card data-intelligence="admin-chart-runs">
			<CardHeader>
				<CardTitle>Runs (14 days)</CardTitle>
				<CardDescription className="tabular-nums">{total} total</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer config={runsChartConfig} className="aspect-auto h-44 w-full">
					<BarChart accessibilityLayer data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
						<CartesianGrid vertical={false} strokeDasharray="3 3" />
						<XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={shortDate} fontSize={10} />
						<YAxis tickLine={false} axisLine={false} fontSize={10} width={28} />
						<ChartTooltip content={<ChartTooltipContent />} />
						<Bar dataKey="runsSuccess" stackId="r" fill="var(--color-runsSuccess)" radius={[0, 0, 0, 0]} />
						<Bar dataKey="runsSkipped" stackId="r" fill="var(--color-runsSkipped)" radius={[0, 0, 0, 0]} />
						<Bar dataKey="runsError" stackId="r" fill="var(--color-runsError)" radius={[3, 3, 0, 0]} />
					</BarChart>
				</ChartContainer>
				<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
					<LegendDot color="var(--color-runsSuccess)" label="Success" />
					<LegendDot color="var(--color-runsSkipped)" label="Skipped" />
					<LegendDot color="var(--color-runsError)" label="Error" />
				</div>
			</CardContent>
		</Card>
	)
}

const tokensChartConfig: ChartConfig = {
	tokensIn: { label: 'In', color: 'var(--color-fuchsia-500, oklch(0.66 0.27 330))' },
	tokensOut: { label: 'Out', color: 'var(--color-amber-500, oklch(0.78 0.17 70))' },
}

export function TokenUsageChart({ data }: { data: Array<DailySeriesPoint> }) {
	const totalCost = data.reduce((s, d) => s + d.costUsd, 0)
	return (
		<Card data-intelligence="admin-chart-tokens">
			<CardHeader>
				<CardTitle>Tokens &amp; cost (14 days)</CardTitle>
				<CardDescription className="tabular-nums">${totalCost.toFixed(2)} total</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer config={tokensChartConfig} className="aspect-auto h-44 w-full">
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
						<YAxis tickLine={false} axisLine={false} fontSize={10} width={36} tickFormatter={n => formatNumber(n as number)} />
						<ChartTooltip content={<ChartTooltipContent />} />
						<Area type="monotone" dataKey="tokensIn" stackId="t" stroke="var(--color-tokensIn)" fill="url(#fillIn)" strokeWidth={2} />
						<Area type="monotone" dataKey="tokensOut" stackId="t" stroke="var(--color-tokensOut)" fill="url(#fillOut)" strokeWidth={2} />
					</AreaChart>
				</ChartContainer>
				<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
					<LegendDot color="var(--color-tokensIn)" label="Input" />
					<LegendDot color="var(--color-tokensOut)" label="Output" />
				</div>
			</CardContent>
		</Card>
	)
}
