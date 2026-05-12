// Server-only impls for widget data feeds. Lives in a separate file from
// `widgets.ts` so server-only side-effecting imports stay out of the
// client bundle. `widgets.ts` only references these from inside server-fn
// handler / inputValidator bodies, which TanStack Start strips on the
// client.
//
// The upcoming-holidays feed is per-USER, not per-list. For the signed-in
// user it emits the next N closest holidays (default 3) sourced from a
// two-layer gating model:
//
//   * TENANT GATE (admin master toggles) - tenant-disable wins for
//     everyone on the deployment, regardless of user state.
//   * PER-USER GATE - within tenants that allow the holiday, does this
//     user actually have someone to celebrate with?
//
// Per source:
//
//   1. Admin-curated `custom_holidays` (catalog + custom).
//      Tenant gate:  `enableGenericHolidayLists`. The same flag gates
//                    holiday-typed list creation, so a deployment that
//                    has turned the whole holiday concept off won't
//                    surface admin-curated rows either.
//      Per-user gate: none. If the admin curated it, every user sees it.
//   2. Hard-coded gift-giving holidays:
//        - Christmas (Dec 25)
//          Tenant:   `enableChristmasLists`
//          Per-user: none. Universal.
//        - Valentine's Day (Feb 14)
//          Tenant:   `enableValentinesDayReminders`
//          Per-user: user has a `partnerId`.
//        - Mother's Day (per `relationshipRemindersCountry`)
//          Tenant:   `enableMothersDayReminders`
//          Per-user: at least one `userRelationLabels.label='mother'` row.
//        - Father's Day (same)
//          Tenant:   `enableFathersDayReminders`
//          Per-user: at least one `label='father'` row.
//   3. Wedding anniversary
//      Tenant:   `enableAnniversaryReminders`
//      Per-user: `partnerAnniversary` AND `partnerId` both set.
//
// The tenant master toggles mirror the per-arm gates in
// `relationship-reminders.ts` and the list-type gates in
// `_lists-impl.ts`, so the widget never surfaces something the email
// cron or the list-create flow has already been told to suppress.
//
// Dedup: holidays that resolve to the same UTC (month, day) are
// collapsed; admin-curated rows win over hardcoded ones so a
// per-deployment override (different title, etc.) replaces the default.
// Date math runs through the same helpers the auto-archive cron uses,
// so widget and cron never disagree about when an occurrence is.

import { and, eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { customHolidays, userRelationLabels, users } from '@/db/schema'
import { customHolidayNextOccurrence, startOfUtcDay } from '@/lib/custom-holidays'
import { nextOccurrence } from '@/lib/holidays'
import { getAppSettings } from '@/lib/settings-loader'

// =====================================================================
// Public types
// =====================================================================

// Discriminates how the row was sourced so clients can pick an icon /
// label without re-parsing `id`. Stable for the lifetime of the wire
// format; new sources get a new value rather than overloading an
// existing one.
export type UpcomingHolidaySource = 'custom' | 'christmas' | 'mothers-day' | 'fathers-day' | 'valentines' | 'anniversary'

export type UpcomingHolidayRow = {
	// Stable identifier across requests. iOS widgets use this for diffing.
	// Formats:
	//   'custom:{uuid}'         - admin-curated custom_holidays row
	//   'christmas'             - hardcoded Dec 25
	//   'mothers-day:{cc}'      - hardcoded Mother's Day in `cc` country
	//   'fathers-day:{cc}'      - hardcoded Father's Day in `cc` country
	//   'valentines'            - hardcoded Feb 14
	//   'anniversary:{userId}'  - the signed-in user's partner anniversary
	id: string
	source: UpcomingHolidaySource
	// Human-readable holiday name as it should appear in widget rows.
	title: string
	// ISO 8601 timestamp at the start of the holiday's UTC-anchored day.
	occurrenceStart: string
	// Whole-day count from "today" (UTC) to `occurrenceStart`. Always
	// >= 0; the server filters past occurrences before sending.
	daysUntil: number
}

export type GetUpcomingHolidaysArgs = {
	userId: string
	// Optional hard cap. The widget is "next N closest holidays"; the
	// default matches the iOS widget's render slot count.
	limit?: number
	// Optional horizon filter (days). Defaults to one full year so
	// annually-recurring rows always have a future occurrence to land
	// on. The web debug surface tightens this via the horizon slider.
	horizonDays?: number
	now?: Date
	dbx?: SchemaDatabase
}

const DEFAULT_LIMIT = 3
const DEFAULT_HORIZON_DAYS = 366

function utcDayMs(d: Date): number {
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// Resolves the next occurrence (>= today UTC) of a fixed (month, day),
// rolling forward to next year when the date has already passed.
function nextAnnualDate(month: number, day: number, now: Date): Date {
	const thisYear = now.getUTCFullYear()
	const todayMs = startOfUtcDay(now).getTime()
	const candidate = new Date(Date.UTC(thisYear, month - 1, day))
	if (candidate.getTime() >= todayMs) return candidate
	return new Date(Date.UTC(thisYear + 1, month - 1, day))
}

// Internal candidate shape. Sources are merged into this list, deduped
// by UTC (month, day), then sorted + capped.
type Candidate = {
	id: string
	source: UpcomingHolidaySource
	title: string
	occurrence: Date
	// Priority for dedup: higher wins when two candidates resolve to the
	// same (month, day). `custom` beats hardcoded so admin overrides
	// take precedence.
	priority: number
}

export async function getUpcomingHolidaysImpl(args: GetUpcomingHolidaysArgs): Promise<Array<UpcomingHolidayRow>> {
	const { userId, limit = DEFAULT_LIMIT, horizonDays = DEFAULT_HORIZON_DAYS, now = new Date(), dbx = db } = args

	if (limit <= 0 || horizonDays < 0) return []

	const settings = await getAppSettings(dbx)
	const country = settings.relationshipRemindersCountry
	const todayUtcMs = utcDayMs(now)
	const horizonMs = todayUtcMs + horizonDays * 86_400_000

	// Load the signed-in user's state once and derive every per-user
	// gate from it. Mirrors `relationshipRemindersImpl` so the widget
	// never surfaces a holiday the email cron would silently skip.
	const me = await dbx.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { partnerId: true, partnerAnniversary: true },
	})
	const isPartnered = Boolean(me?.partnerId)
	const hasMotherLabel = await hasRelationLabel(dbx, userId, 'mother')
	const hasFatherLabel = await hasRelationLabel(dbx, userId, 'father')

	const candidates: Array<Candidate> = []

	// ---------------------------------------------------------------
	// 1. Admin-curated `custom_holidays`. Tenant-gated on the same flag
	//    that gates holiday-typed list creation: if the deployment has
	//    the whole concept turned off, an admin row left behind in the
	//    table should not surface either. No per-user gate.
	// ---------------------------------------------------------------
	if (settings.enableGenericHolidayLists) {
		const customRows = await dbx.select().from(customHolidays)
		for (const row of customRows) {
			const occurrence = await customHolidayNextOccurrence(row, now, dbx)
			if (!occurrence) continue
			candidates.push({
				id: `custom:${row.id}`,
				source: 'custom',
				title: row.title,
				occurrence,
				priority: 2,
			})
		}
	}

	// ---------------------------------------------------------------
	// 2. Hard-coded gift-giving holidays. Each is gated TWICE:
	//    once on the tenant master toggle, then on whether the
	//    signed-in user has someone to celebrate with.
	// ---------------------------------------------------------------
	if (settings.enableChristmasLists) {
		// No per-user gate: Christmas applies to everyone the tenant
		// celebrates it with.
		candidates.push({
			id: 'christmas',
			source: 'christmas',
			title: 'Christmas',
			occurrence: nextAnnualDate(12, 25, now),
			priority: 1,
		})
	}

	if (settings.enableValentinesDayReminders && isPartnered) {
		candidates.push({
			id: 'valentines',
			source: 'valentines',
			title: "Valentine's Day",
			occurrence: nextAnnualDate(2, 14, now),
			priority: 1,
		})
	}

	if (settings.enableMothersDayReminders && hasMotherLabel) {
		const mothersDay = await nextOccurrence(country, 'mothers-day', now, dbx)
		if (mothersDay) {
			candidates.push({
				id: `mothers-day:${country}`,
				source: 'mothers-day',
				title: "Mother's Day",
				occurrence: mothersDay,
				priority: 1,
			})
		}
	}

	if (settings.enableFathersDayReminders && hasFatherLabel) {
		const fathersDay = await nextOccurrence(country, 'fathers-day', now, dbx)
		if (fathersDay) {
			candidates.push({
				id: `fathers-day:${country}`,
				source: 'fathers-day',
				title: "Father's Day",
				occurrence: fathersDay,
				priority: 1,
			})
		}
	}

	// ---------------------------------------------------------------
	// 3. Per-user wedding anniversary. Tenant-gated; per-user gate
	//    requires both `partnerId` (currently partnered) AND
	//    `partnerAnniversary` set so an abandoned anniversary value
	//    doesn't leak forward after an unpairing.
	// ---------------------------------------------------------------
	if (settings.enableAnniversaryReminders && isPartnered && me?.partnerAnniversary && /^\d{4}-\d{2}-\d{2}$/.test(me.partnerAnniversary)) {
		const parts = me.partnerAnniversary.split('-').map(Number)
		const mm = parts[1]
		const dd = parts[2]
		if (Number.isFinite(mm) && Number.isFinite(dd)) {
			candidates.push({
				id: `anniversary:${userId}`,
				source: 'anniversary',
				title: 'Anniversary',
				occurrence: nextAnnualDate(mm, dd, now),
				priority: 1,
			})
		}
	}

	// ---------------------------------------------------------------
	// Dedup by UTC (month, day). Custom rows (priority 2) beat
	// hardcoded rows (priority 1). Ties on priority resolve to the
	// row inserted first.
	// ---------------------------------------------------------------
	const bestByDayKey = new Map<string, Candidate>()
	for (const c of candidates) {
		const occurrenceMs = utcDayMs(c.occurrence)
		if (occurrenceMs < todayUtcMs || occurrenceMs > horizonMs) continue
		const key = `${c.occurrence.getUTCMonth()}-${c.occurrence.getUTCDate()}`
		const existing = bestByDayKey.get(key)
		if (!existing || c.priority > existing.priority) {
			bestByDayKey.set(key, c)
		}
	}

	const merged = Array.from(bestByDayKey.values())
	merged.sort((a, b) => {
		const aMs = utcDayMs(a.occurrence)
		const bMs = utcDayMs(b.occurrence)
		if (aMs !== bMs) return aMs - bMs
		return a.title.localeCompare(b.title)
	})

	return merged.slice(0, limit).map(c => {
		const occurrenceMs = utcDayMs(c.occurrence)
		const daysUntil = Math.round((occurrenceMs - todayUtcMs) / 86_400_000)
		return {
			id: c.id,
			source: c.source,
			title: c.title,
			occurrenceStart: new Date(occurrenceMs).toISOString(),
			daysUntil,
		}
	})
}

// True when the user has at least one `userRelationLabels` row of the
// given label. Used to gate the per-user Mother's/Father's Day rows.
async function hasRelationLabel(dbx: SchemaDatabase, userId: string, label: 'mother' | 'father'): Promise<boolean> {
	const row = await dbx
		.select({ id: userRelationLabels.id })
		.from(userRelationLabels)
		.where(and(eq(userRelationLabels.userId, userId), eq(userRelationLabels.label, label)))
		.limit(1)
	return row.length > 0
}
