// Single source of truth for "when does this list's claimed gifts
// auto-reveal?" date math, shared by the list loaders (banner display) and
// the cron's deferred-due pass. The normal cron passes keep their own
// reverse-date-matching ("whose birthday was N days ago?"); this helper is
// the forward-looking view: given a list + now, what's the next reveal date
// and are we in the force-reveal window.
//
// Mirrors the per-type occurrence math in src/lib/cron/auto-archive.ts:
//   - birthday / wishlist: archived `archiveDaysAfterBirthday` days after the
//     owner's birthday (local-time month/day, matching the cron's matcher).
//   - christmas: `archiveDaysAfterChristmas` days after Dec 25 (local).
//   - holiday: `archiveDaysAfterHoliday` days after the custom holiday's
//     occurrence end (UTC, via the same catalog/custom helpers the cron uses).
//
// See .notes/logic.md "Auto-archive deferral & last-archived".

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import type { BirthMonth } from '@/db/schema/enums'
import type { CustomHolidayRow } from '@/lib/custom-holidays'
import { customHolidayLastOccurrence, customHolidayNextOccurrence } from '@/lib/custom-holidays'
import { endOfOccurrence } from '@/lib/holidays'

const DAY_MS = 86_400_000

const MONTH_INDEX: Record<BirthMonth, number> = {
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

function addDays(d: Date, n: number): Date {
	return new Date(d.getTime() + n * DAY_MS)
}

type Occurrence = { start: Date; end: Date }
type OccurrencePair = { last: Occurrence | null; next: Occurrence | null }

export type ArchiveScheduleInput = {
	type: string
	isActive: boolean
	subjectDependentId: string | null
	archiveDeferUntil: Date | null
	lastArchivedAt: Date | null
	customHolidayId: string | null
	customHoliday: CustomHolidayRow | null
	ownerBirthMonth: BirthMonth | null
	ownerBirthDay: number | null
}

// The per-type archive offsets, read from app settings by the caller.
export type ArchiveDaysSettings = {
	archiveDaysAfterBirthday: number
	archiveDaysAfterChristmas: number
	archiveDaysAfterHoliday: number
}

export type ArchiveSchedule = {
	// False when the list type never auto-archives (giftideas/todos), the
	// list is inactive, it's a dependent-subject list, a holiday list with no
	// holiday selected, or a birthday/wishlist whose owner has no birthday set.
	applies: boolean
	// The relevant occurrence's event date: the open cycle's event if we're
	// between the event and its reveal, otherwise the next upcoming event.
	// Null when there is no resolvable upcoming occurrence (e.g. a one-time
	// past holiday already archived).
	eventDate: Date | null
	// eventDate + archiveDaysAfter{Type}. The reveal date absent any defer.
	defaultArchiveDate: Date | null
	// archiveDeferUntil (if set on the open cycle) otherwise defaultArchiveDate.
	effectiveArchiveDate: Date | null
	// The active defer (in the future) for the open cycle, else null.
	deferUntil: Date | null
	// now >= eventDate for the open cycle.
	eventHasPassed: boolean
	// now is in [eventDate, effectiveArchiveDate) AND no defer is active.
	// This is exactly when the recipient-side force-reveal CTA is offered.
	inForceWindow: boolean
	lastArchivedAt: Date | null
}

const NOT_APPLICABLE: ArchiveSchedule = {
	applies: false,
	eventDate: null,
	defaultArchiveDate: null,
	effectiveArchiveDate: null,
	deferUntil: null,
	eventHasPassed: false,
	inForceWindow: false,
	lastArchivedAt: null,
}

function annualOccurrences(now: Date, makeDate: (year: number) => Date): OccurrencePair {
	const thisYear = makeDate(now.getFullYear())
	if (now.getTime() >= thisYear.getTime()) {
		return {
			last: { start: thisYear, end: thisYear },
			next: { start: makeDate(now.getFullYear() + 1), end: makeDate(now.getFullYear() + 1) },
		}
	}
	const prev = makeDate(now.getFullYear() - 1)
	return { last: { start: prev, end: prev }, next: { start: thisYear, end: thisYear } }
}

async function holidayOccurrences(row: CustomHolidayRow, now: Date, dbx: SchemaDatabase): Promise<OccurrencePair> {
	const isCatalog = row.source === 'catalog' && !!row.catalogCountry && !!row.catalogKey

	const lastStart = await customHolidayLastOccurrence(row, now, dbx)
	let last: Occurrence | null = null
	if (lastStart) {
		const end = isCatalog ? ((await endOfOccurrence(row.catalogCountry!, row.catalogKey!, lastStart, dbx)) ?? lastStart) : lastStart
		last = { start: lastStart, end }
	}

	const nextStart = await customHolidayNextOccurrence(row, now, dbx)
	let next: Occurrence | null = null
	if (nextStart) {
		const end = isCatalog ? ((await endOfOccurrence(row.catalogCountry!, row.catalogKey!, nextStart, dbx)) ?? nextStart) : nextStart
		next = { start: nextStart, end }
	}

	return { last, next }
}

/**
 * Compute the forward-looking archive schedule for a single list.
 */
export async function computeArchiveSchedule(
	input: ArchiveScheduleInput,
	settings: ArchiveDaysSettings,
	now: Date = new Date(),
	dbx: SchemaDatabase = db
): Promise<ArchiveSchedule> {
	if (!input.isActive || input.subjectDependentId) return NOT_APPLICABLE

	let archiveDays: number
	let occurrences: OccurrencePair

	if (input.type === 'birthday' || input.type === 'wishlist') {
		if (input.ownerBirthMonth == null || input.ownerBirthDay == null) return NOT_APPLICABLE
		const monthIndex = MONTH_INDEX[input.ownerBirthMonth]
		archiveDays = settings.archiveDaysAfterBirthday
		occurrences = annualOccurrences(now, year => new Date(year, monthIndex, input.ownerBirthDay!))
	} else if (input.type === 'christmas') {
		archiveDays = settings.archiveDaysAfterChristmas
		occurrences = annualOccurrences(now, year => new Date(year, 11, 25))
	} else if (input.type === 'holiday') {
		if (!input.customHolidayId || !input.customHoliday) return NOT_APPLICABLE
		archiveDays = settings.archiveDaysAfterHoliday
		occurrences = await holidayOccurrences(input.customHoliday, now, dbx)
	} else {
		// giftideas, todos, test - never auto-archive.
		return NOT_APPLICABLE
	}

	const defer = input.archiveDeferUntil

	// Is the most-recent occurrence's cycle still open (we haven't reached its
	// effective reveal date yet)? If so it's the one we surface.
	if (occurrences.last) {
		const defaultArchiveDate = addDays(occurrences.last.end, archiveDays)
		const effectiveArchiveDate = defer ?? defaultArchiveDate
		if (now.getTime() < effectiveArchiveDate.getTime()) {
			const deferActive = defer != null && defer.getTime() > now.getTime()
			const eventHasPassed = now.getTime() >= occurrences.last.start.getTime()
			return {
				applies: true,
				eventDate: occurrences.last.start,
				defaultArchiveDate,
				effectiveArchiveDate,
				deferUntil: deferActive ? defer : null,
				eventHasPassed,
				inForceWindow: eventHasPassed && !deferActive,
				lastArchivedAt: input.lastArchivedAt,
			}
		}
	}

	// The last occurrence already revealed (or there isn't one). Surface the
	// next upcoming occurrence. A defer never applies here: the cron clears it
	// once consumed, so a future cycle always starts at the derived default.
	if (occurrences.next) {
		const defaultArchiveDate = addDays(occurrences.next.end, archiveDays)
		return {
			applies: true,
			eventDate: occurrences.next.start,
			defaultArchiveDate,
			effectiveArchiveDate: defaultArchiveDate,
			deferUntil: null,
			eventHasPassed: false,
			inForceWindow: false,
			lastArchivedAt: input.lastArchivedAt,
		}
	}

	// One-time holiday in the past with no future occurrence. The list type
	// participates in auto-archive but there's no upcoming reveal to show.
	return {
		applies: true,
		eventDate: null,
		defaultArchiveDate: null,
		effectiveArchiveDate: null,
		deferUntil: null,
		eventHasPassed: false,
		inForceWindow: false,
		lastArchivedAt: input.lastArchivedAt,
	}
}

/**
 * Upper bound for a defer: the open cycle's event date + maxDeferDays.
 * Returns null when there's no event date to anchor against.
 */
export function maxDeferDate(eventDate: Date | null, maxDeferDays: number): Date | null {
	if (!eventDate) return null
	return addDays(eventDate, maxDeferDays)
}
