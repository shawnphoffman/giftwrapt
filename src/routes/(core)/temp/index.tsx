import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { Gift } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { ClientOnly } from '@/components/utilities/client-only'
import type { UpcomingHolidayRow } from '@/db-collections/upcoming-holidays'
import { upcomingHolidaysCollection } from '@/db-collections/upcoming-holidays'
import { cn } from '@/lib/utils'

// `/temp` lands on the Holidays widget surface. The Birthdays surface
// lives at `/temp/birthdays`. Splitting them keeps the two debug feeds
// independent so a slow query on one doesn't block the other.
export const Route = createFileRoute('/(core)/temp/')({
	component: HolidaysWidgetPage,
})

const DEFAULT_HOLIDAY_HORIZON = 90

const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatOccurrence(iso: string): string {
	// Holiday rows carry UTC-anchored dates (the server emits start-of-
	// UTC-day timestamps); read with UTC getters so the label doesn't
	// shift in negative-offset zones.
	const d = new Date(iso)
	return `${monthShort[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function sourceLabel(source: UpcomingHolidayRow['source']): string {
	switch (source) {
		case 'custom':
			return 'Admin'
		case 'christmas':
			return 'Christmas'
		case 'mothers-day':
			return "Mother's Day"
		case 'fathers-day':
			return "Father's Day"
		case 'valentines':
			return "Valentine's"
		case 'anniversary':
			return 'Anniversary'
	}
}

function HolidaysWidgetPage() {
	return (
		<ClientOnly>
			<HolidaysWidgetPageInner />
		</ClientOnly>
	)
}

function HolidaysWidgetPageInner() {
	const holidayQueryResult = useLiveQuery(q => q.from({ row: upcomingHolidaysCollection }).select(({ row }) => ({ ...row })))
	const holidayRowsAll = Array.from(holidayQueryResult.data.values()) as Array<UpcomingHolidayRow>
	const holidaysLoading = holidayQueryResult.isLoading

	const [horizon, setHorizon] = useState(DEFAULT_HOLIDAY_HORIZON)
	const visible = holidayRowsAll.filter(r => r.daysUntil <= horizon).sort((a, b) => a.daysUntil - b.daysUntil)

	return (
		<>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">iOS Upcoming Holidays Widget</CardTitle>
					<CardDescription>
						Per-user feed of the next closest holidays for the signed-in user. Sources: admin-curated Custom Holidays, the hard-coded
						gift-giving holidays (Christmas always, Valentine's when partnered, Mother's / Father's Day when the user has a matching
						relation label), and the user's anniversary when partnered with an anniversary date set. The iOS widget renders the closest 3
						within the configured horizon.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<HorizonControl
						label="Horizon (days)"
						help="Hide holidays further out than this. The iOS widget config exposes the same horizon as a 30 / 60 / 90 / 180 / 365 picker."
						value={horizon}
						min={7}
						max={365}
						onChange={setHorizon}
					/>
					<HolidayWidgetFrame rows={visible.slice(0, 3)} horizonDays={horizon} isLoading={holidaysLoading} />
				</CardContent>
			</Card>

			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Underlying Data</CardTitle>
					<CardDescription>
						Every row the server would return for the signed-in user (capped at 50 by the debug query). Rows outside the {horizon}
						-day preview horizon are still shown so you can see why.
					</CardDescription>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-muted-foreground border-b">
								<th className="py-2 pr-4 font-medium">Holiday</th>
								<th className="py-2 pr-4 font-medium">Source</th>
								<th className="py-2 pr-4 font-medium">Date</th>
								<th className="py-2 pr-4 font-medium">Days until</th>
								<th className="py-2 pr-4 font-medium">In preview</th>
							</tr>
						</thead>
						<tbody>
							{holidayRowsAll.map(row => {
								const inWidget = row.daysUntil <= horizon
								return (
									<tr key={row.id} className="border-b last:border-b-0">
										<td className="py-2 pr-4">{row.title}</td>
										<td className="py-2 pr-4 font-mono text-xs">{sourceLabel(row.source)}</td>
										<td className="py-2 pr-4 font-mono text-xs">{formatOccurrence(row.occurrenceStart)}</td>
										<td className="py-2 pr-4 font-mono text-xs">{row.daysUntil}</td>
										<td className="py-2 pr-4">{inWidget ? <Badge>visible</Badge> : <Badge variant="secondary">hidden</Badge>}</td>
									</tr>
								)
							})}
						</tbody>
					</table>
					{holidayRowsAll.length === 0 && !holidaysLoading && (
						<p className="mt-3 text-xs text-muted-foreground">
							No holidays surfaced for this user. Add some in the Custom Holidays admin section, tag a parent in the Relationships settings,
							or partner up to unlock Valentine's and the anniversary row.
						</p>
					)}
				</CardContent>
			</Card>
		</>
	)
}

function HorizonControl({
	label,
	help,
	value,
	min,
	max,
	onChange,
}: {
	label: string
	help: string
	value: number
	min: number
	max: number
	onChange: (v: number) => void
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between">
				<span className="text-sm font-medium">{label}</span>
				<span className="font-mono text-sm">{value}</span>
			</div>
			<Slider value={[value]} min={min} max={max} step={1} onValueChange={v => onChange(v[0] ?? value)} />
			<span className="text-xs text-muted-foreground">{help}</span>
		</div>
	)
}

function HolidayWidgetFrame({
	rows,
	horizonDays,
	isLoading,
}: {
	rows: Array<UpcomingHolidayRow>
	horizonDays: number
	isLoading: boolean
}) {
	const frameClass =
		'mx-auto w-[320px] rounded-3xl border bg-gradient-to-b from-rose-50 to-amber-50 dark:from-rose-950 dark:to-amber-950 p-5 shadow-sm'
	if (isLoading) {
		return (
			<div className={frameClass}>
				<div className="flex items-center gap-2 mb-3">
					<Gift className="size-4 text-rose-500" />
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming Holidays</span>
				</div>
				<p className="text-sm text-muted-foreground">Loading...</p>
			</div>
		)
	}
	if (rows.length === 0) {
		return (
			<div className={frameClass}>
				<div className="flex items-center gap-2 mb-3">
					<Gift className="size-4 text-rose-500" />
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming Holidays</span>
				</div>
				<p className="text-sm text-muted-foreground">No holidays in the next {horizonDays} days.</p>
			</div>
		)
	}
	return (
		<div className={frameClass}>
			<div className="flex items-center gap-2 mb-3">
				<Gift className="size-4 text-rose-500" />
				<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming Holidays</span>
			</div>
			<ul className="flex flex-col gap-2.5">
				{rows.map(row => (
					<li key={row.id} className="flex items-center gap-3">
						<div className="size-9 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
							<Gift className="size-4 text-rose-500" />
						</div>
						<div className="flex flex-col min-w-0 flex-1">
							<span className="text-sm font-semibold truncate">{row.title}</span>
							<span className="text-xs text-muted-foreground truncate">{formatOccurrence(row.occurrenceStart)}</span>
						</div>
						<span
							className={cn(
								'font-mono text-xs px-2 py-0.5 rounded-full',
								row.daysUntil <= 7
									? 'bg-rose-500 text-white'
									: row.daysUntil <= 30
										? 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
										: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
							)}
						>
							{row.daysUntil === 0 ? 'today' : `${row.daysUntil}d`}
						</span>
					</li>
				))}
			</ul>
		</div>
	)
}
