// Server-only impls for the list reveal-timing controls surfaced on the
// edit view: force-reveal-now, set/extend the archive deferral, and cancel
// it. All three are edit-access gated (`canEditList`) and operate on the
// "open cycle" computed by `computeArchiveSchedule`.
//
// Window rules (see .notes/logic.md "Auto-archive deferral & last-archived"):
//   - force-reveal: only in the post-event, pre-reveal gap, and only when no
//     defer is active (an active defer must be cancelled first - two clicks).
//   - set/extend defer: only once the event has passed (binds the defer to
//     the just-occurred cycle unambiguously); push-later only; capped at
//     event + maxArchiveDeferDays.
//   - cancel defer: always allowed for edit-access holders.

import { eq } from 'drizzle-orm'
import type { z } from 'zod'

import type { CancelArchiveDeferInputSchema, ForceArchiveListInputSchema, SetArchiveDeferInputSchema } from '@/api/_archive-defer-schemas'
import { type CancelArchiveDeferResult, type ForceArchiveListResult, type SetArchiveDeferResult } from '@/api/_archive-defer-schemas'
import { archiveListPurchasesImpl } from '@/api/_items-extra-impl'
import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { lists, users } from '@/db/schema'
import type { ArchiveSchedule } from '@/lib/archive-schedule'
import { computeArchiveSchedule, maxDeferDate } from '@/lib/archive-schedule'
import { maybeSendListRevealEmail } from '@/lib/cron/reveal-emails'
import { getCustomHoliday } from '@/lib/custom-holidays'
import { canEditList } from '@/lib/permissions'
import { getAppSettings } from '@/lib/settings-loader'

type ScheduleContext = {
	list: {
		id: number
		ownerId: string
		name: string
		type: string
		customHolidayId: string | null
		subjectDependentId: string | null
		isPrivate: boolean
		isActive: boolean
	}
	schedule: ArchiveSchedule
	settings: Awaited<ReturnType<typeof getAppSettings>>
	now: Date
}

async function loadScheduleContext(
	userId: string,
	listId: number,
	dbx: SchemaDatabase,
	now: Date
): Promise<ScheduleContext | { error: 'not-found' | 'not-authorized' }> {
	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: {
			id: true,
			ownerId: true,
			name: true,
			type: true,
			subjectDependentId: true,
			isPrivate: true,
			isActive: true,
			customHolidayId: true,
			archiveDeferUntil: true,
			lastArchivedAt: true,
		},
	})
	if (!list) return { error: 'not-found' }

	// Owner always edits their own list; otherwise fall back to the
	// guardian/editor grants. Mirrors `assertCanEditItems`.
	if (list.ownerId !== userId) {
		const perm = await canEditList(userId, list, dbx)
		if (!perm.ok) return { error: 'not-authorized' }
	}

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
		list: {
			id: list.id,
			ownerId: list.ownerId,
			name: list.name,
			type: list.type,
			customHolidayId: list.customHolidayId,
			subjectDependentId: list.subjectDependentId,
			isPrivate: list.isPrivate,
			isActive: list.isActive,
		},
		schedule,
		settings,
		now,
	}
}

export async function forceArchiveListImpl(args: {
	userId: string
	input: z.infer<typeof ForceArchiveListInputSchema>
	dbx?: SchemaDatabase
	now?: Date
}): Promise<ForceArchiveListResult> {
	const { userId, input, dbx = db, now = new Date() } = args
	const ctx = await loadScheduleContext(userId, input.listId, dbx, now)
	if ('error' in ctx) return { kind: 'error', reason: ctx.error }

	const { schedule, list, settings } = ctx
	if (!schedule.applies) return { kind: 'error', reason: 'not-applicable' }
	if (schedule.deferUntil) return { kind: 'error', reason: 'deferred' }
	if (!schedule.eventHasPassed) return { kind: 'error', reason: 'too-early' }

	const revealed = await archiveListPurchasesImpl({ userId, input: { listId: input.listId }, dbx })
	if (revealed.kind === 'error') return { kind: 'error', reason: 'not-authorized' }

	await dbx.update(lists).set({ lastArchivedAt: now }).where(eq(lists.id, input.listId))

	const emailSent = await maybeSendListRevealEmail(
		dbx,
		{ id: list.id, ownerId: list.ownerId, name: list.name, type: list.type, customHolidayId: list.customHolidayId },
		settings
	)

	return { kind: 'ok', updated: revealed.updated, addonsArchived: revealed.addonsArchived, emailSent }
}

export async function setArchiveDeferImpl(args: {
	userId: string
	input: z.infer<typeof SetArchiveDeferInputSchema>
	dbx?: SchemaDatabase
	now?: Date
}): Promise<SetArchiveDeferResult> {
	const { userId, input, dbx = db, now = new Date() } = args
	const ctx = await loadScheduleContext(userId, input.listId, dbx, now)
	if ('error' in ctx) return { kind: 'error', reason: ctx.error }

	const { schedule, settings } = ctx
	if (!schedule.applies || !schedule.eventDate || !schedule.effectiveArchiveDate) return { kind: 'error', reason: 'not-applicable' }
	// Extension binds to the open cycle, so the event must have passed.
	if (!schedule.eventHasPassed) return { kind: 'error', reason: 'too-early' }

	const target = input.deferUntil
	// Push-later only, relative to the current effective reveal date (the
	// active defer if any, else the derived default).
	if (target.getTime() <= schedule.effectiveArchiveDate.getTime()) return { kind: 'error', reason: 'must-be-later' }

	const cap = maxDeferDate(schedule.eventDate, settings.maxArchiveDeferDays)
	if (cap && target.getTime() > cap.getTime()) return { kind: 'error', reason: 'exceeds-max' }

	await dbx.update(lists).set({ archiveDeferUntil: target }).where(eq(lists.id, input.listId))
	return { kind: 'ok', deferUntil: target.toISOString() }
}

export async function cancelArchiveDeferImpl(args: {
	userId: string
	input: z.infer<typeof CancelArchiveDeferInputSchema>
	dbx?: SchemaDatabase
	now?: Date
}): Promise<CancelArchiveDeferResult> {
	const { userId, input, dbx = db, now = new Date() } = args
	const ctx = await loadScheduleContext(userId, input.listId, dbx, now)
	if ('error' in ctx) return { kind: 'error', reason: ctx.error }

	await dbx.update(lists).set({ archiveDeferUntil: null }).where(eq(lists.id, input.listId))
	return { kind: 'ok' }
}
