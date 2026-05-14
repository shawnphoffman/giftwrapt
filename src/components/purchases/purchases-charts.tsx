// Lazy-loaded chart island for the purchases page. Holds the recharts
// imports + the shared ChartContainer (which itself drags recharts in
// via `import * as RechartsPrimitive from 'recharts'`). Loading this
// island only when the page actually renders charts keeps ~350 KB of
// recharts off the static graph for `/purchases`.

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { CardContent } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

const chartConfig = {
	gifts: { label: 'Gifts', color: 'var(--color-cyan-700)' },
	addons: { label: 'Addons', color: 'var(--color-violet-700)' },
} satisfies ChartConfig

type RecipientPoint = { name: string; gifts: number; addons: number }
type MonthPoint = { month: string; gifts: number; addons: number }

export function SpendByRecipientChart({ data }: { data: Array<RecipientPoint> }) {
	return (
		<CardContent>
			{data.length > 0 ? (
				<ChartContainer config={chartConfig} className="aspect-auto h-60 w-full">
					<BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
						<CartesianGrid vertical={false} />
						<XAxis
							dataKey="name"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							interval={0}
							tickFormatter={v => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
						/>
						<YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} tickFormatter={v => `$${v}`} />
						<ChartTooltip content={<ChartTooltipContent indicator="dot" valueFormatter={v => `$${Number(v).toFixed(2)}`} />} />
						<Bar dataKey="gifts" stackId="a" fill="var(--color-gifts)" isAnimationActive={false} radius={[0, 0, 0, 0]} />
						<Bar dataKey="addons" stackId="a" fill="var(--color-addons)" isAnimationActive={false} radius={[4, 4, 0, 0]} />
					</BarChart>
				</ChartContainer>
			) : (
				<div className="text-sm text-muted-foreground py-6 text-center">No data.</div>
			)}
		</CardContent>
	)
}

export function SpendOverTimeChart({ data }: { data: Array<MonthPoint> }) {
	return (
		<CardContent>
			{data.length > 0 ? (
				<ChartContainer config={chartConfig} className="aspect-auto h-60 w-full">
					<BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
						<CartesianGrid vertical={false} />
						<XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
						<YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} tickFormatter={v => `$${v}`} />
						<ChartTooltip content={<ChartTooltipContent indicator="dot" valueFormatter={v => `$${Number(v).toFixed(2)}`} />} />
						<Bar dataKey="gifts" stackId="a" fill="var(--color-gifts)" isAnimationActive={false} radius={[0, 0, 0, 0]} />
						<Bar dataKey="addons" stackId="a" fill="var(--color-addons)" isAnimationActive={false} radius={[4, 4, 0, 0]} />
					</BarChart>
				</ChartContainer>
			) : (
				<div className="text-sm text-muted-foreground py-6 text-center">No data.</div>
			)}
		</CardContent>
	)
}
