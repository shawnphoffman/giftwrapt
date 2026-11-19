import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Cake, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

import { RichMessage } from '@/components/common/rich-message'
import UserAvatar from '@/components/common/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { ClientOnly } from '@/components/utilities/client-only'
import type { BirthMonth } from '@/db/schema/enums'
import type { UserWithLists } from '@/db-collections/lists'
import { usersWithListsCollection } from '@/db-collections/lists'
import { formatMonthDay } from '@/lib/i18n/labels'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

// `/temp/birthdays` is the per-user birthday debug surface. The holidays
// surface lives at `/temp` as the landing page; they're split so each
// feed renders independently of the other's data state.
export const Route = createFileRoute('/(core)/temp/birthdays')({
	component: BirthdaysWidgetPage,
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
	const monthIdx = monthIndex[month]
	let next = new Date(today.getFullYear(), monthIdx, day)
	if (next < today) next = new Date(today.getFullYear() + 1, monthIdx, day)
	return Math.round((next.getTime() - today.getTime()) / 86_400_000)
}

function daysSince(date: string | null | undefined, now = new Date()): number | null {
	if (!date) return null
	const ms = now.getTime() - new Date(date).getTime()
	return Math.floor(ms / 86_400_000)
}

function formatBirthday(month: BirthMonth | null | undefined, day: number | null | undefined): string | null {
	if (!month || day == null) return null
	return formatMonthDay(month, day)
}

type WidgetRow = {
	user: UserWithLists
	daysUntil: number
	birthdayLabel: string
	daysSinceLastGift: number | null
	hasWarning: boolean
}

const DEFAULT_HORIZON = 30
// Shown as they are in the database: a column name and an empty value, not text.
const LAST_GIFTED_COLUMN = 'lastGiftedAt'
const NULL_VALUE = 'null'
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

function BirthdaysWidgetPage() {
	return (
		<ClientOnly>
			<BirthdaysWidgetPageInner />
		</ClientOnly>
	)
}

function BirthdaysWidgetPageInner() {
	const queryResult = useLiveQuery(q => q.from({ user: usersWithListsCollection }).select(({ user }) => ({ ...user })))
	const users = Array.from(queryResult.data.values()) as Array<UserWithLists>
	const isLoading = queryResult.isLoading

	const [horizon, setHorizon] = useState(DEFAULT_HORIZON)
	const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
	const now = new Date()
	const rows = buildRows(users, horizon, threshold, now)

	const withBirthday = users.filter(u => u.birthMonth && u.birthDay != null)
	const hidden = withBirthday.length - rows.length
	const noBirthday = users.length - withBirthday.length

	return (
		<>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_temp_birthdays_title()}</CardTitle>
					<CardDescription>{m.admin_temp_birthdays_description()}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<div className="grid gap-4 md:grid-cols-2">
						<ThresholdControl
							label={m.admin_temp_horizon_label()}
							help={m.admin_temp_birthdays_horizon_help()}
							value={horizon}
							min={7}
							max={365}
							onChange={setHorizon}
						/>
						<ThresholdControl
							label={m.admin_temp_stale_threshold_label()}
							help={m.admin_temp_stale_threshold_help()}
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
					<CardTitle className="text-2xl">{m.admin_temp_preview_title()}</CardTitle>
					<CardDescription>
						{isLoading ? m.admin_temp_loading() : m.admin_temp_preview_description({ count: withBirthday.length })}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<WidgetFrame rows={rows} />
				</CardContent>
			</Card>

			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_temp_data_title()}</CardTitle>
					<CardDescription>
						<RichMessage
							parts={m.admin_temp_birthdays_data_description.parts()}
							tags={{ code: c => <code className="font-mono text-xs">{c}</code> }}
						/>
					</CardDescription>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-muted-foreground border-b">
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_person()}</th>
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_birthday()}</th>
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_days_until()}</th>
								<th className="py-2 pr-4 font-medium">{LAST_GIFTED_COLUMN}</th>
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_days_since()}</th>
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_warning()}</th>
								<th className="py-2 pr-4 font-medium">{m.admin_temp_col_in_widget()}</th>
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
											<td className="py-2 pr-4 font-mono text-xs">{user.lastGiftedAt ?? NULL_VALUE}</td>
											<td className="py-2 pr-4 font-mono text-xs">{elapsed ?? '-'}</td>
											<td className="py-2 pr-4">
												{warning ? (
													<Badge variant="destructive" className="gap-1">
														<AlertTriangle className="size-3" />
														{m.admin_temp_badge_stale()}
													</Badge>
												) : (
													<Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
														<CheckCircle2 className="size-3" />
														{m.admin_temp_badge_fresh()}
													</Badge>
												)}
											</td>
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
					{(hidden > 0 || noBirthday > 0) && (
						<p className="mt-3 text-xs text-muted-foreground">
							{hidden > 0 && <>{m.admin_temp_hidden_by_horizon({ count: hidden })} </>}
							{noBirthday > 0 && m.admin_temp_no_birthday({ count: noBirthday })}
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

function WidgetFrame({ rows }: { rows: Array<WidgetRow> }) {
	const frameClass =
		'mx-auto w-80 rounded-3xl border bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-5 shadow-sm'
	if (rows.length === 0) {
		return (
			<div className={frameClass}>
				<div className="flex items-center gap-2 mb-3">
					<Cake className="size-4 text-pink-500" />
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{m.admin_temp_birthdays_widget_heading()}
					</span>
				</div>
				<p className="text-sm text-muted-foreground">{m.admin_temp_birthdays_none()}</p>
			</div>
		)
	}
	return (
		<div className={frameClass}>
			<div className="flex items-center gap-2 mb-3">
				<Cake className="size-4 text-pink-500" />
				<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{m.admin_temp_birthdays_widget_heading()}
				</span>
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
										title={m.admin_temp_no_recent_gift()}
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
								{row.daysUntil === 0 ? m.admin_temp_today() : m.admin_temp_days_short({ count: row.daysUntil })}
							</span>
						</li>
					)
				})}
			</ul>
		</div>
	)
}
