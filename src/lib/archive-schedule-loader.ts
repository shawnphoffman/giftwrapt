// DB-backed loader + serializable DTO for the archive schedule, used by the
// list-view and list-edit loaders to drive the reveal-date banner. Kept
// separate from the pure date math in archive-schedule.ts so that module
// stays free of settings/holiday loading concerns.

import { eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { lists, users } from '@/db/schema'
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

	const [owner] = await dbx.select({ birthMonth: users.birthMonth, birthDay: users.birthDay }).from(users).where(eq(users.id, list.ownerId))
	const customHoliday = list.customHolidayId ? await getCustomHoliday(list.customHolidayId, dbx) : null
	const settings = await getAppSettings(dbx)

	const schedule = await computeArchiveSchedule(
		{
			type: list.type,
			isActive: list.isActive,
			subjectDependentId: list.subjectDependentId,
			archiveDeferUntil: list.archiveDeferUntil,
			lastArchivedAt: list.lastArchivedAt,
			customHolidayId: list.customHolidayId,
			customHoliday,
			ownerBirthMonth: owner.birthMonth ?? null,
			ownerBirthDay: owner.birthDay ?? null,
		},
		settings,
		now,
		dbx
	)

	return {
		applies: schedule.applies,
		eventDate: iso(schedule.eventDate),
		defaultArchiveDate: iso(schedule.defaultArchiveDate),
		effectiveArchiveDate: iso(schedule.effectiveArchiveDate),
		deferUntil: iso(schedule.deferUntil),
		eventHasPassed: schedule.eventHasPassed,
		inForceWindow: schedule.inForceWindow,
		lastArchivedAt: iso(schedule.lastArchivedAt),
	}
}
