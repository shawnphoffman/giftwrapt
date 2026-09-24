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

function SpendGradients() {
	return (
		<defs>
			<linearGradient id="fillGifts" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stopColor="var(--color-gifts)" stopOpacity={1} />
				<stop offset="100%" stopColor="var(--color-gifts)" stopOpacity={0.45} />
			</linearGradient>
			<linearGradient id="fillAddons" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stopColor="var(--color-addons)" stopOpacity={1} />
				<stop offset="100%" stopColor="var(--color-addons)" stopOpacity={0.45} />
			</linearGradient>
		</defs>
	)
}

// Recipient names are open-ended (dependents like "Scoop & Blueberry"), so
// this chart runs horizontally: each name gets its own row with a fixed-width
// label column instead of competing for a bar-width slot on the x-axis.
const NAME_AXIS_WIDTH = 96
const ROW_HEIGHT = 28
const MIN_CHART_HEIGHT = 240

const NAME_FONT_SIZE = 12

let measureCtx: CanvasRenderingContext2D | null | undefined

// Truncates `text` with an ellipsis so it renders within `maxWidth` px, measured
// against the page's actual font. recharts' <Text maxLines> wraps by word first
// and ellipsizes short two-word names that would have fit.
function fitText(text: string, maxWidth: number): string {
	if (measureCtx === undefined) measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
	if (!measureCtx) return text
	measureCtx.font = `${NAME_FONT_SIZE}px ${getComputedStyle(document.body).fontFamily}`
	if (measureCtx.measureText(text).width <= maxWidth) return text
	let lo = 0
	let hi = text.length
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2)
		if (measureCtx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= maxWidth) lo = mid
		else hi = mid - 1
	}
	return `${text.slice(0, lo).trimEnd()}…`
}

function RecipientNameTick({ x, y, fill, payload }: { x?: number; y?: number; fill?: string; payload?: { value: string } }) {
	const name = payload?.value ?? ''
	return (
		<text x={x} y={y} fill={fill} fontSize={NAME_FONT_SIZE} textAnchor="end" dominantBaseline="central">
			<title>{name}</title>
			{fitText(name, NAME_AXIS_WIDTH - 8)}
		</text>
	)
}

export function SpendByRecipientChart({ data }: { data: Array<RecipientPoint> }) {
	const height = Math.max(MIN_CHART_HEIGHT, data.length * ROW_HEIGHT + 32)
	return (
		<CardContent>
			{data.length > 0 ? (
				<ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height }}>
					<BarChart accessibilityLayer layout="vertical" data={data} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
						<defs>
							<linearGradient id="fillGiftsH" x1="0" y1="0" x2="1" y2="0">
								<stop offset="0%" stopColor="var(--color-gifts)" stopOpacity={0.45} />
								<stop offset="100%" stopColor="var(--color-gifts)" stopOpacity={1} />
							</linearGradient>
							<linearGradient id="fillAddonsH" x1="0" y1="0" x2="1" y2="0">
								<stop offset="0%" stopColor="var(--color-addons)" stopOpacity={0.45} />
								<stop offset="100%" stopColor="var(--color-addons)" stopOpacity={1} />
							</linearGradient>
						</defs>
						<CartesianGrid horizontal={false} />
						<XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={v => `$${v}`} />
						<YAxis
							type="category"
							dataKey="name"
							tickLine={false}
							axisLine={false}
							width={NAME_AXIS_WIDTH}
							interval={0}
							tick={<RecipientNameTick />}
						/>
						<ChartTooltip content={<ChartTooltipContent indicator="dot" valueFormatter={v => `$${Number(v).toFixed(2)}`} />} />
						<Bar dataKey="gifts" stackId="a" fill="url(#fillGiftsH)" isAnimationActive={false} radius={[0, 0, 0, 0]} />
						<Bar dataKey="addons" stackId="a" fill="url(#fillAddonsH)" isAnimationActive={false} radius={[0, 4, 4, 0]} />
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
						<SpendGradients />
						<CartesianGrid vertical={false} />
						<XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
						<YAxis tickLine={false} axisLine={false} tickMargin={8} width="auto" tickFormatter={v => `$${v}`} />
						<ChartTooltip content={<ChartTooltipContent indicator="dot" valueFormatter={v => `$${Number(v).toFixed(2)}`} />} />
						<Bar dataKey="gifts" stackId="a" fill="url(#fillGifts)" isAnimationActive={false} radius={[0, 0, 0, 0]} />
						<Bar dataKey="addons" stackId="a" fill="url(#fillAddons)" isAnimationActive={false} radius={[4, 4, 0, 0]} />
					</BarChart>
				</ChartContainer>
			) : (
				<div className="text-sm text-muted-foreground py-6 text-center">No data.</div>
			)}
		</CardContent>
	)
}
