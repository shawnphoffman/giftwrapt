// Server-only impl for the parental-relations reminder pass. Piggybacks
// on the daily birthday-emails cron rather than getting its own
// endpoint; the work is bounded (zero or one batch per day per holiday)
// and the channel is the same.
//
// Trigger: today is exactly `leadDays` away from the next Mother's Day
// or Father's Day. We use the US catalog dates as a best-effort
// approximation since users have no per-user country today; a future
// per-user country setting can swap the lookup.

import { eq, inArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { dependents, userRelationLabels, users } from '@/db/schema'
import type { RelationLabel } from '@/db/schema/enums'
import { getCatalogEntry, nextOccurrence } from '@/lib/holidays'
import { sendParentalRelationsReminderEmail } from '@/lib/resend'

const COUNTRY = 'US'

type LabelTrigger = { label: RelationLabel; key: string; date: Date }

export type ParentalRemindersResult = {
	parentalReminderEmails: number
}

type Args = {
	db: SchemaDatabase
	now: Date
	leadDays: number
}

// Same-calendar-day comparison ignoring time-of-day. Avoids the
// off-by-hours problems you get from raw `getTime()` deltas when the
// library returns local-time Dates.
function isSameUtcDay(a: Date, b: Date): boolean {
	return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
}

export async function parentalRemindersImpl({ db, now, leadDays }: Args): Promise<ParentalRemindersResult> {
	const triggers = await resolveTriggers(db, now, leadDays)
	if (triggers.length === 0) {
		return { parentalReminderEmails: 0 }
	}

	let sent = 0
	for (const trigger of triggers) {
		// Find every user with at least one declared row of this label,
		// joined to their email + their target's display name.
		const rows = await db
			.select({
				userId: userRelationLabels.userId,
				userEmail: users.email,
				targetUserId: userRelationLabels.targetUserId,
				targetDependentId: userRelationLabels.targetDependentId,
			})
			.from(userRelationLabels)
			.innerJoin(users, eq(users.id, userRelationLabels.userId))
			.where(eq(userRelationLabels.label, trigger.label))

		if (rows.length === 0) continue

		// Resolve target names in one round trip per kind.
		const targetUserIds = Array.from(new Set(rows.map(r => r.targetUserId).filter((x): x is string => Boolean(x))))
		const targetDepIds = Array.from(new Set(rows.map(r => r.targetDependentId).filter((x): x is string => Boolean(x))))
		const targetUsers = targetUserIds.length
			? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, targetUserIds))
			: []
		const targetDeps = targetDepIds.length
			? await db.select({ id: dependents.id, name: dependents.name }).from(dependents).where(inArray(dependents.id, targetDepIds))
			: []
		const userNameById = new Map(targetUsers.map(u => [u.id, u.name ?? u.email]))
		const depNameById = new Map(targetDeps.map(d => [d.id, d.name]))

		// Group recipients by user, collecting their target names.
		type Recipient = { email: string; people: Array<{ name: string }> }
		const byUserId = new Map<string, Recipient>()
		for (const row of rows) {
			const name = row.targetUserId
				? userNameById.get(row.targetUserId)
				: row.targetDependentId
					? depNameById.get(row.targetDependentId)
					: undefined
			if (!name) continue
			const existing = byUserId.get(row.userId) ?? { email: row.userEmail, people: [] }
			existing.people.push({ name })
			byUserId.set(row.userId, existing)
		}

		const entry = await getCatalogEntry(COUNTRY, trigger.key, db)
		const holidayName = entry?.name ?? trigger.key

		for (const recipient of byUserId.values()) {
			try {
				await sendParentalRelationsReminderEmail(recipient.email, {
					holidayName,
					leadDays,
					people: recipient.people,
				})
				sent += 1
			} catch {
				// Per-recipient failure is logged inline in resend; swallow
				// here so a single bad address doesn't kill the batch.
			}
		}
	}

	return { parentalReminderEmails: sent }
}

// Returns every (label, key, date) that is exactly `leadDays` away from
// `now` in calendar terms. Today is "exactly N days before" if (now +
// leadDays) lands on the same calendar day as the holiday's next
// occurrence.
async function resolveTriggers(db: SchemaDatabase, now: Date, leadDays: number): Promise<Array<LabelTrigger>> {
	const target = new Date(now)
	target.setUTCDate(target.getUTCDate() + leadDays)

	const out: Array<LabelTrigger> = []
	for (const [label, key] of [
		['mother', 'mothers-day'],
		['father', 'fathers-day'],
	] as const) {
		const date = await nextOccurrence(COUNTRY, key, now, db)
		if (date && isSameUtcDay(date, target)) {
			out.push({ label, key, date })
		}
	}
	return out
}
