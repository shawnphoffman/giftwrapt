// DB-backed loader + serializable DTO for the archive schedule, used by the
// list-view and list-edit loaders to drive the reveal-date banner. Kept
// separate from the pure date math in archive-schedule.ts so that module
// stays free of settings/holiday loading concerns.

import { eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { dependents, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'
import { computeArchiveSchedule } from '@/lib/archive-schedule'
import { getCustomHoliday } from '@/lib/custom-holidays'
import { getAppSettings } from '@/lib/settings-loader'

// Serializable shape sent to the client. Dates are ISO strings; null when
// not applicable / unresolved.
export type ArchiveBannerInfo = {
	applies: boolean
	eventDate: string | null
	defaultArchiveDate: string | null
	effectiveArchiveDate: string | null
	deferUntil: string | null
	eventHasPassed: boolean
	inForceWindow: boolean
	lastArchivedAt: string | null
	// Why a list that would otherwise auto-reveal doesn't. Only set for the
	// cases the UI can help with: a birthday/wishlist list whose recipient
	// (the owner, or the dependent it is for) has no birthday, which drives
	// the "add a birthday" banner. Null for every other not-applicable list
	// and whenever `applies` is true.
	notApplicableReason: 'owner-no-birthday' | 'dependent-no-birthday' | null
}

export type RecipientBirthday = { birthMonth: BirthMonth | null; birthDay: number | null }

/**
 * The birthday a birthday/wishlist list reveals after: the dependent's for
 * a list made for a dependent, otherwise the owner's. A guardian's own
 * birthday never drives a dependent's list.
 */
export async function loadRecipientBirthday(
	list: { ownerId: string; subjectDependentId: string | null },
	dbx: SchemaDatabase = db
): Promise<RecipientBirthday> {
	if (list.subjectDependentId) {
		const dep = await dbx.query.dependents.findFirst({
			where: eq(dependents.id, list.subjectDependentId),
			columns: { birthMonth: true, birthDay: true },
		})
		return { birthMonth: dep?.birthMonth ?? null, birthDay: dep?.birthDay ?? null }
	}
	const owner = await dbx.query.users.findFirst({ where: eq(users.id, list.ownerId), columns: { birthMonth: true, birthDay: true } })
	return { birthMonth: owner?.birthMonth ?? null, birthDay: owner?.birthDay ?? null }
}

const NOT_APPLICABLE: ArchiveBannerInfo = {
	applies: false,
	eventDate: null,
	defaultArchiveDate: null,
	effectiveArchiveDate: null,
	deferUntil: null,
	eventHasPassed: false,
	inForceWindow: false,
	lastArchivedAt: null,
	notApplicableReason: null,
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

/**
 * Load the archive banner info for a list. Self-contained (re-queries the
 * fields it needs) so callers only add a single call + a field on their
 * result. Returns a not-applicable shape for lists that never auto-archive.
 */
export async function loadArchiveBannerInfo(listId: number, dbx: SchemaDatabase = db, now: Date = new Date()): Promise<ArchiveBannerInfo> {
	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: {
			id: true,
			ownerId: true,
			type: true,
			subjectDependentId: true,
			isActive: true,
			customHolidayId: true,
			archiveDeferUntil: true,
			lastArchivedAt: true,
		},
	})
	if (!list) return NOT_APPLICABLE

	const recipientBirthday = await loadRecipientBirthday(list, dbx)
	const customHoliday = list.customHolidayId ? await getCustomHoliday(list.customHolidayId, dbx) : null
	const settings = await getAppSettings(dbx)

	const schedule = await computeArchiveSchedule(
		{
			type: list.type,
			isActive: list.isActive,
			archiveDeferUntil: list.archiveDeferUntil,
			lastArchivedAt: list.lastArchivedAt,
			customHolidayId: list.customHolidayId,
			customHoliday,
			recipientBirthMonth: recipientBirthday.birthMonth,
			recipientBirthDay: recipientBirthday.birthDay,
		},
		settings,
		now,
		dbx
	)

	const recipientHasNoBirthday =
		!schedule.applies &&
		list.isActive &&
		(list.type === 'birthday' || list.type === 'wishlist') &&
		(!recipientBirthday.birthMonth || !recipientBirthday.birthDay)

	return {
		applies: schedule.applies,
		eventDate: iso(schedule.eventDate),
		defaultArchiveDate: iso(schedule.defaultArchiveDate),
		effectiveArchiveDate: iso(schedule.effectiveArchiveDate),
		deferUntil: iso(schedule.deferUntil),
		eventHasPassed: schedule.eventHasPassed,
		inForceWindow: schedule.inForceWindow,
		lastArchivedAt: iso(schedule.lastArchivedAt),
		notApplicableReason: recipientHasNoBirthday ? (list.subjectDependentId ? 'dependent-no-birthday' : 'owner-no-birthday') : null,
	}
}
