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
import { formatCalendarDate } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

// `/temp` lands on the Holidays widget surface. The Birthdays surface
// lives at `/temp/birthdays`. Splitting them keeps the two debug feeds
// independent so a slow query on one doesn't block the other.
export const Route = createFileRoute('/(core)/temp/')({
	component: HolidaysWidgetPage,
})

const DEFAULT_HOLIDAY_HORIZON = 90

function formatOccurrence(iso: string): string {
	// Holiday rows carry UTC-anchored dates (the server emits start-of-
	// UTC-day timestamps); format in UTC so the label doesn't shift in
	// negative-offset zones.
	return formatCalendarDate(iso, { month: 'short', day: 'numeric' })
}

function sourceLabel(source: UpcomingHolidayRow['source']): string {
	switch (source) {
		case 'custom':
			return m.admin_temp_source_admin()
		case 'christmas':
			return m.admin_temp_source_christmas()
		case 'mothers-day':
			return m.admin_temp_source_mothers_day()
		case 'fathers-day':
			return m.admin_temp_source_fathers_day()
		case 'valentines':
			return m.admin_temp_source_valentines()
		case 'anniversary':
			return m.admin_temp_source_anniversary()
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
					<CardTitle className="text-2xl">{m.admin_temp_holidays_title()}</CardTitle>
					<CardDescription>{m.admin_temp_holidays_description()}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<HorizonControl
						label={m.admin_temp_horizon_label()}
						help={m.admin_temp_holidays_horizon_help()}
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
					<CardTitle className="text-2xl">{m.admin_temp_data_title()}</CardTitle>
					<CardDescription>{m.admin_temp_holidays_data_description({ horizon })}</CardDescription>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-muted-foreground border-b">
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_holiday()}</th>
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_source()}</th>
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_date()}</th>
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_days_until()}</th>
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_in_preview()}</th>
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
										<td className="py-2 pr-4">
											{inWidget ? (
												<Badge>{m.admin_temp_badge_visible()}</Badge>
											) : (
												<Badge variant="secondary">{m.admin_temp_badge_hidden()}</Badge>
											)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
					{holidayRowsAll.length === 0 && !holidaysLoading && (
						<p className="mt-3 text-xs text-muted-foreground">{m.admin_temp_holidays_empty()}</p>
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
		'mx-auto w-80 rounded-3xl border bg-gradient-to-b from-rose-50 to-amber-50 dark:from-rose-950 dark:to-amber-950 p-5 shadow-sm'
	if (isLoading) {
		return (
			<div className={frameClass}>
				<div className="flex items-center gap-2 mb-3">
					<Gift className="size-4 text-rose-500" />
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{m.admin_temp_holidays_widget_heading()}
					</span>
				</div>
				<p className="text-sm text-muted-foreground">{m.admin_temp_loading()}</p>
			</div>
		)
	}
	if (rows.length === 0) {
		return (
			<div className={frameClass}>
				<div className="flex items-center gap-2 mb-3">
					<Gift className="size-4 text-rose-500" />
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{m.admin_temp_holidays_widget_heading()}
					</span>
				</div>
				<p className="text-sm text-muted-foreground">{m.admin_temp_holidays_none({ count: horizonDays })}</p>
			</div>
		)
	}
	return (
		<div className={frameClass}>
			<div className="flex items-center gap-2 mb-3">
				<Gift className="size-4 text-rose-500" />
				<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{m.admin_temp_holidays_widget_heading()}
				</span>
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
							{row.daysUntil === 0 ? m.admin_temp_today() : m.admin_temp_days_short({ count: row.daysUntil })}
						</span>
					</li>
				))}
			</ul>
		</div>
	)
}
