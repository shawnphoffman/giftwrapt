import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Cake, CheckCircle2, Gift, Sparkles } from 'lucide-react'
import { useState } from 'react'

import DependentAvatar from '@/components/common/dependent-avatar'
import UserAvatar from '@/components/common/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { ClientOnly } from '@/components/utilities/client-only'
import type { BirthMonth } from '@/db/schema/enums'
import type { UserWithLists } from '@/db-collections/lists'
import { usersWithListsCollection } from '@/db-collections/lists'
import type { HolidayWidgetRow } from '@/db-collections/upcoming-holidays'
import { upcomingHolidaysCollection } from '@/db-collections/upcoming-holidays'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(core)/temp/widgets')({
	component: WidgetsPage,
})

const monthIndex: Record<BirthMonth, number> = {
	january: 0,
	february: 1,
	march: 2,
	april: 3,
	may: 4,
	june: 5,
	july: 6,
	august: 7,
	september: 8,
	october: 9,
	november: 10,
	december: 11,
}

// Mirror of the iOS widget's countdown math.
function daysUntilBirthday(month: BirthMonth | null | undefined, day: number | null | undefined, now = new Date()): number | null {
	if (!month || day == null) return null
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
	const m = monthIndex[month]
	let next = new Date(today.getFullYear(), m, day)
	if (next < today) next = new Date(today.getFullYear() + 1, m, day)
	return Math.round((next.getTime() - today.getTime()) / 86_400_000)
}

function daysSince(date: string | null | undefined, now = new Date()): number | null {
	if (!date) return null
	const ms = now.getTime() - new Date(date).getTime()
	return Math.floor(ms / 86_400_000)
}

function formatBirthday(month: BirthMonth | null | undefined, day: number | null | undefined): string | null {
	if (!month || day == null) return null
	return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${day}`
}

type WidgetRow = {
	user: UserWithLists
	daysUntil: number
	birthdayLabel: string
	daysSinceLastGift: number | null
	hasWarning: boolean
}

type HolidayWidgetDisplayRow = HolidayWidgetRow & { hasWarning: boolean }

function holidayHasWarning(row: HolidayWidgetRow, staleThresholdDays: number, now: Date): boolean {
	if (row.ownedByMe) return false
	const elapsed = daysSince(row.lastGiftedAt, now)
	return elapsed == null || elapsed > staleThresholdDays
}

const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatOccurrence(iso: string): string {
	const d = new Date(iso)
	return `${monthShort[d.getMonth()]} ${d.getDate()}`
}

const DEFAULT_HORIZON = 30
const DEFAULT_THRESHOLD = 60

function buildRows(users: Array<UserWithLists>, horizonDays: number, staleThresholdDays: number, now: Date): Array<WidgetRow> {
	return users
		.map<WidgetRow | null>(user => {
			const daysUntil = daysUntilBirthday(user.birthMonth, user.birthDay, now)
			const label = formatBirthday(user.birthMonth, user.birthDay)
			if (daysUntil == null || label == null) return null
			if (daysUntil > horizonDays) return null
			const elapsed = daysSince(user.lastGiftedAt, now)
			const hasWarning = elapsed == null || elapsed > staleThresholdDays
			return { user, daysUntil, birthdayLabel: label, daysSinceLastGift: elapsed, hasWarning }
		})
		.filter((row): row is WidgetRow => row !== null)
		.sort((a, b) => a.daysUntil - b.daysUntil)
}

function WidgetsPage() {
	return (
		<ClientOnly>
			<WidgetsPageInner />
		</ClientOnly>
	)
}

function WidgetsPageInner() {
	const queryResult = useLiveQuery(q => q.from({ user: usersWithListsCollection }).select(({ user }) => ({ ...user })))
	const users = Array.from(queryResult.data.values()) as Array<UserWithLists>
	const isLoading = queryResult.isLoading

	const holidayQueryResult = useLiveQuery(q => q.from({ row: upcomingHolidaysCollection }).select(({ row }) => ({ ...row })))
	const holidayRowsAll = Array.from(holidayQueryResult.data.values()) as Array<HolidayWidgetRow>
	const holidaysLoading = holidayQueryResult.isLoading

	const [horizon, setHorizon] = useState(DEFAULT_HORIZON)
	const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
	const [scope, setScope] = useState<'shop-for' | 'all'>('all')
	const now = new Date()
	const rows = buildRows(users, horizon, threshold, now)
	const holidayRows = holidayRowsAll
		.filter(r => r.daysUntil <= horizon)
		.filter(r => (scope === 'shop-for' ? !r.ownedByMe : true))
		.map(r => ({ ...r, hasWarning: holidayHasWarning(r, threshold, now) }))
		.sort((a, b) => a.daysUntil - b.daysUntil)

	const withBirthday = users.filter(u => u.birthMonth && u.birthDay != null)
	const hidden = withBirthday.length - rows.length
	const noBirthday = users.length - withBirthday.length

	return (
		<>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">iOS Upcoming Birthdays Widget</CardTitle>
					<CardDescription>
						Universe = anyone whose lists you can see (same set as the home page). For each one with a birthday on file, show countdown plus
						a warning when you haven't gifted them recently. Sliders below let you tune the thresholds.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<div className="grid gap-4 md:grid-cols-2">
						<ThresholdControl
							label="Horizon (days)"
							help="Hide people whose birthday is further out than this. The web home page surfaces ~30 days as a soft callout."
							value={horizon}
							min={7}
							max={365}
							onChange={setHorizon}
						/>
						<ThresholdControl
							label="Stale threshold (days)"
							help="Show the warning indicator when lastGiftedAt is older than this (or null)."
							value={threshold}
							min={7}
							max={180}
							onChange={setThreshold}
						/>
					</div>
				</CardContent>
			</Card>

			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Widget Preview</CardTitle>
					<CardDescription>
						{isLoading
							? 'Loading...'
							: `What the widget would render right now from ${withBirthday.length} ${withBirthday.length === 1 ? 'person' : 'people'} with birthdays on file.`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<WidgetFrame rows={rows} />
				</CardContent>
			</Card>

			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Upcoming Holidays Widget</CardTitle>
					<CardDescription>
						Universe = holiday-typed lists I can see (mine + ones from people I shop for + ones I edit + dependents I guard). Reuses the
						birthday widget's horizon and stale-threshold sliders. Switch the scope to filter out my own lists.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => setScope('all')}
							className={cn(
								'rounded-md border px-3 py-1 text-sm',
								scope === 'all' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'
							)}
						>
							All upcoming
						</button>
						<button
							type="button"
							onClick={() => setScope('shop-for')}
							className={cn(
								'rounded-md border px-3 py-1 text-sm',
								scope === 'shop-for' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'
							)}
						>
							People I shop for
						</button>
					</div>
					<HolidayWidgetFrame rows={holidayRows} isLoading={holidaysLoading} />
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-muted-foreground border-b">
									<th className="py-2 pr-4 font-medium">Recipient</th>
									<th className="py-2 pr-4 font-medium">Holiday</th>
									<th className="py-2 pr-4 font-medium">List</th>
									<th className="py-2 pr-4 font-medium">Days until</th>
									<th className="py-2 pr-4 font-medium">Owned by me</th>
									<th className="py-2 pr-4 font-medium">Last gifted</th>
									<th className="py-2 pr-4 font-medium">Warning</th>
								</tr>
							</thead>
							<tbody>
								{holidayRowsAll.map(row => {
									const elapsed = daysSince(row.lastGiftedAt, now)
									const warning = holidayHasWarning(row, threshold, now)
									return (
										<tr key={row.listId} className="border-b last:border-b-0">
											<td className="py-2 pr-4">
												<div className="flex items-center gap-2">
													{row.recipient.kind === 'dependent' ? (
														<DependentAvatar name={row.recipient.name} image={row.recipient.image} size="small" />
													) : (
														<UserAvatar name={row.recipient.name ?? 'Unknown'} image={row.recipient.image} size="small" />
													)}
													<span>{row.recipient.name ?? 'Unknown'}</span>
												</div>
											</td>
											<td className="py-2 pr-4">{row.holidayName}</td>
											<td className="py-2 pr-4">{row.listName}</td>
											<td className="py-2 pr-4 font-mono text-xs">{row.daysUntil}</td>
											<td className="py-2 pr-4 font-mono text-xs">{row.ownedByMe ? 'yes' : 'no'}</td>
											<td className="py-2 pr-4 font-mono text-xs">{elapsed == null ? '-' : `${elapsed}d ago`}</td>
											<td className="py-2 pr-4">
												{warning ? (
													<Badge variant="destructive" className="gap-1">
														<AlertTriangle className="size-3" />
														stale
													</Badge>
												) : row.ownedByMe ? (
													<Badge variant="outline" className="gap-1 text-sky-700 border-sky-300">
														<Sparkles className="size-3" />
														mine
													</Badge>
												) : (
													<Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
														<CheckCircle2 className="size-3" />
														fresh
													</Badge>
												)}
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
						{holidayRowsAll.length === 0 && !holidaysLoading && (
							<p className="mt-3 text-xs text-muted-foreground">No holiday lists in the data feed.</p>
						)}
					</div>
				</CardContent>
			</Card>

			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Underlying Data</CardTitle>
					<CardDescription>
						Per-user computed values for everyone returned by <code className="font-mono text-xs">/api/lists/public</code>. Rows hidden by
						the horizon are still shown so you can see why.
					</CardDescription>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-muted-foreground border-b">
								<th className="py-2 pr-4 font-medium">Person</th>
								<th className="py-2 pr-4 font-medium">Birthday</th>
								<th className="py-2 pr-4 font-medium">Days until</th>
								<th className="py-2 pr-4 font-medium">lastGiftedAt</th>
								<th className="py-2 pr-4 font-medium">Days since</th>
								<th className="py-2 pr-4 font-medium">Warning</th>
								<th className="py-2 pr-4 font-medium">In widget</th>
							</tr>
						</thead>
						<tbody>
							{[...users]
								.sort((a, b) => {
									const aDays = daysUntilBirthday(a.birthMonth, a.birthDay, now) ?? Number.POSITIVE_INFINITY
									const bDays = daysUntilBirthday(b.birthMonth, b.birthDay, now) ?? Number.POSITIVE_INFINITY
									return aDays - bDays
								})
								.map(user => {
									const daysUntil = daysUntilBirthday(user.birthMonth, user.birthDay, now)
									const elapsed = daysSince(user.lastGiftedAt, now)
									const inWidget = daysUntil != null && daysUntil <= horizon
									const warning = elapsed == null || elapsed > threshold
									const displayName = user.name ?? user.email
									return (
										<tr key={user.id} className="border-b last:border-b-0">
											<td className="py-2 pr-4">
												<div className="flex items-center gap-2">
													<UserAvatar name={displayName} image={user.image} size="small" />
													<span>{displayName}</span>
												</div>
											</td>
											<td className="py-2 pr-4 font-mono text-xs">{formatBirthday(user.birthMonth, user.birthDay) ?? '-'}</td>
											<td className="py-2 pr-4 font-mono text-xs">{daysUntil ?? '-'}</td>
											<td className="py-2 pr-4 font-mono text-xs">{user.lastGiftedAt ?? 'null'}</td>
											<td className="py-2 pr-4 font-mono text-xs">{elapsed ?? '-'}</td>
											<td className="py-2 pr-4">
												{warning ? (
													<Badge variant="destructive" className="gap-1">
														<AlertTriangle className="size-3" />
														stale
													</Badge>
												) : (
													<Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
														<CheckCircle2 className="size-3" />
														fresh
													</Badge>
												)}
											</td>
											<td className="py-2 pr-4">{inWidget ? <Badge>visible</Badge> : <Badge variant="secondary">hidden</Badge>}</td>
										</tr>
									)
								})}
						</tbody>
					</table>
					{(hidden > 0 || noBirthday > 0) && (
						<p className="mt-3 text-xs text-muted-foreground">
							{hidden > 0 && <>Hidden by horizon: {hidden}. </>}
							{noBirthday > 0 && <>Without birthday on file: {noBirthday}.</>}
						</p>
					)}
				</CardContent>
			</Card>
		</>
	)
}

function ThresholdControl({
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

function HolidayWidgetFrame({ rows, isLoading }: { rows: Array<HolidayWidgetDisplayRow>; isLoading: boolean }) {
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
				<p className="text-sm text-muted-foreground">No holiday lists in the horizon window.</p>
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
				{rows.map(row => {
					const recipientName = row.recipient.name ?? 'Unknown'
					return (
						<li key={row.listId} className="flex items-center gap-3">
							<div className="relative">
								{row.recipient.kind === 'dependent' ? (
									<DependentAvatar name={recipientName} image={row.recipient.image} size="medium" />
								) : (
									<UserAvatar name={recipientName} image={row.recipient.image} size="medium" />
								)}
								{row.hasWarning && (
									<span
										title="No recent gift"
										className="absolute -top-1 -right-1 size-5 rounded-full bg-amber-500 border-2 border-white dark:border-slate-950 flex items-center justify-center"
									>
										<AlertTriangle className="size-3 text-white" />
									</span>
								)}
								{row.ownedByMe && (
									<span
										title="Your own list"
										className="absolute -bottom-1 -right-1 size-5 rounded-full bg-sky-500 border-2 border-white dark:border-slate-950 flex items-center justify-center"
									>
										<Sparkles className="size-3 text-white" />
									</span>
								)}
							</div>
							<div className="flex flex-col min-w-0 flex-1">
								<span className="text-sm font-semibold truncate">{recipientName}</span>
								<span className="text-xs text-muted-foreground truncate">
									{row.holidayName} - {formatOccurrence(row.occurrenceStart)}
								</span>
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
					)
				})}
			</ul>
		</div>
	)
}

function WidgetFrame({ rows }: { rows: Array<WidgetRow> }) {
	const frameClass =
		'mx-auto w-[320px] rounded-3xl border bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-5 shadow-sm'
	if (rows.length === 0) {
		return (
			<div className={frameClass}>
				<div className="flex items-center gap-2 mb-3">
					<Cake className="size-4 text-pink-500" />
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming Birthdays</span>
				</div>
				<p className="text-sm text-muted-foreground">No birthdays in the horizon window.</p>
			</div>
		)
	}
	return (
		<div className={frameClass}>
			<div className="flex items-center gap-2 mb-3">
				<Cake className="size-4 text-pink-500" />
				<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming Birthdays</span>
			</div>
			<ul className="flex flex-col gap-2.5">
				{rows.map(row => {
					const displayName = row.user.name ?? row.user.email
					return (
						<li key={row.user.id} className="flex items-center gap-3">
							<div className="relative">
								<UserAvatar name={displayName} image={row.user.image} size="medium" />
								{row.hasWarning && (
									<span
										title="No recent gift"
										className="absolute -top-1 -right-1 size-5 rounded-full bg-amber-500 border-2 border-white dark:border-slate-950 flex items-center justify-center"
									>
										<AlertTriangle className="size-3 text-white" />
									</span>
								)}
							</div>
							<div className="flex flex-col min-w-0 flex-1">
								<span className="text-sm font-semibold truncate">{displayName}</span>
								<span className="text-xs text-muted-foreground">{row.birthdayLabel}</span>
							</div>
							<span
								className={cn(
									'font-mono text-xs px-2 py-0.5 rounded-full',
									row.daysUntil <= 7
										? 'bg-pink-500 text-white'
										: row.daysUntil <= 30
											? 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
											: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
								)}
							>
								{row.daysUntil === 0 ? 'today' : `${row.daysUntil}d`}
							</span>
						</li>
					)
				})}
			</ul>
		</div>
	)
}
