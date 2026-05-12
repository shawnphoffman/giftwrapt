// Phase C relationship-reminders cron. Supersedes
// `parental-reminders.ts` with a four-family fan-out:
//
//   - Mother's Day: per-user, fires if today + leadDays === next
//     occurrence of Mother's Day in `relationshipRemindersCountry`, AND
//     the user has at least one `userRelationLabels.label='mother'` row.
//   - Father's Day: same pattern, `label='father'`.
//   - Valentine's Day: Feb 14 globally; fires for users with
//     `partnerId IS NOT NULL`.
//   - Anniversary: fires for each user whose `partnerAnniversary` date
//     (month/day) is exactly leadDays away. Both partners get the email
//     because anniversary is mirrored to both rows in `users`.
//
// Mother's / Father's Day reuse the existing parental-relations email
// (HolidayName/leadDays/people props); Valentine's and Anniversary have
// their own dedicated templates.

import { eq, inArray, sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { dependents, userRelationLabels, users } from '@/db/schema'
import type { RelationLabel } from '@/db/schema/enums'
import { isSameUtcDay } from '@/lib/custom-holidays'
import { getCatalogEntry, nextOccurrence } from '@/lib/holidays'
import { sendParentsDayReminderEmail, sendPartnerAnniversaryReminderEmail, sendValentinesDayReminderEmail } from '@/lib/resend'

export type RelationshipRemindersResult = {
	mothersDayReminders: number
	fathersDayReminders: number
	valentinesDayReminders: number
	anniversaryReminders: number
}

type Args = {
	db: SchemaDatabase
	now: Date
	settings: {
		relationshipRemindersCountry: string
		enableMothersDayReminders: boolean
		mothersDayReminderLeadDays: number
		enableMothersDayReminderEmails: boolean
		enableFathersDayReminders: boolean
		fathersDayReminderLeadDays: number
		enableFathersDayReminderEmails: boolean
		enableValentinesDayReminders: boolean
		valentinesDayReminderLeadDays: number
		enableValentinesDayReminderEmails: boolean
		enableAnniversaryReminders: boolean
		anniversaryReminderLeadDays: number
		enableAnniversaryReminderEmails: boolean
	}
}

export async function relationshipRemindersImpl({ db, now, settings }: Args): Promise<RelationshipRemindersResult> {
	const out: RelationshipRemindersResult = {
		mothersDayReminders: 0,
		fathersDayReminders: 0,
		valentinesDayReminders: 0,
		anniversaryReminders: 0,
	}

	if (settings.enableMothersDayReminders && settings.enableMothersDayReminderEmails) {
		out.mothersDayReminders = await sendParentLabelReminders(
			db,
			now,
			'mother',
			'mothers-day',
			settings.mothersDayReminderLeadDays,
			settings.relationshipRemindersCountry
		)
	}
	if (settings.enableFathersDayReminders && settings.enableFathersDayReminderEmails) {
		out.fathersDayReminders = await sendParentLabelReminders(
			db,
			now,
			'father',
			'fathers-day',
			settings.fathersDayReminderLeadDays,
			settings.relationshipRemindersCountry
		)
	}
	if (settings.enableValentinesDayReminders && settings.enableValentinesDayReminderEmails) {
		out.valentinesDayReminders = await sendValentinesReminders(db, now, settings.valentinesDayReminderLeadDays)
	}
	if (settings.enableAnniversaryReminders && settings.enableAnniversaryReminderEmails) {
		out.anniversaryReminders = await sendAnniversaryReminders(db, now, settings.anniversaryReminderLeadDays)
	}

	return out
}

async function sendParentLabelReminders(
	db: SchemaDatabase,
	now: Date,
	label: RelationLabel,
	catalogKey: string,
	leadDays: number,
	country: string
): Promise<number> {
	const target = new Date(now)
	target.setUTCDate(target.getUTCDate() + leadDays)
	const occurrence = await nextOccurrence(country, catalogKey, now, db)
	if (!occurrence || !isSameUtcDay(occurrence, target)) return 0

	const rows = await db
		.select({
			userId: userRelationLabels.userId,
			userEmail: users.email,
			targetUserId: userRelationLabels.targetUserId,
			targetDependentId: userRelationLabels.targetDependentId,
		})
		.from(userRelationLabels)
		.innerJoin(users, eq(users.id, userRelationLabels.userId))
		.where(eq(userRelationLabels.label, label))

	if (rows.length === 0) return 0

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

	const entry = await getCatalogEntry(country, catalogKey, db)
	const holidayName = entry?.name ?? catalogKey

	let sent = 0
	for (const recipient of byUserId.values()) {
		try {
			await sendParentsDayReminderEmail(recipient.email, { holidayName, leadDays, people: recipient.people })
			sent += 1
		} catch {
			/* logged in resend */
		}
	}
	return sent
}

async function sendValentinesReminders(db: SchemaDatabase, now: Date, leadDays: number): Promise<number> {
	const target = new Date(now)
	target.setUTCDate(target.getUTCDate() + leadDays)
	const isValentines = target.getUTCMonth() === 1 && target.getUTCDate() === 14
	if (!isValentines) return 0

	const rows = await db
		.select({ id: users.id, email: users.email, name: users.name, partnerId: users.partnerId })
		.from(users)
		.where(sql`${users.partnerId} IS NOT NULL AND ${users.banned} = false`)

	if (rows.length === 0) return 0
	const partnerIds = rows.map(r => r.partnerId!).filter(Boolean)
	const partners = partnerIds.length
		? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, partnerIds))
		: []
	const partnerNameById = new Map(partners.map(p => [p.id, p.name ?? p.email]))

	let sent = 0
	for (const u of rows) {
		const partnerName = u.partnerId ? partnerNameById.get(u.partnerId) : undefined
		if (!partnerName) continue
		try {
			await sendValentinesDayReminderEmail(u.email, { name: u.name ?? u.email, partnerName, leadDays })
			sent += 1
		} catch {
			/* logged in resend */
		}
	}
	return sent
}

async function sendAnniversaryReminders(db: SchemaDatabase, now: Date, leadDays: number): Promise<number> {
	const target = new Date(now)
	target.setUTCDate(target.getUTCDate() + leadDays)
	const month = target.getUTCMonth() + 1 // 1-12
	const day = target.getUTCDate()

	// SQL date comparison on month/day. partnerAnniversary is stored as
	// a date string 'YYYY-MM-DD'. Extract MM and DD via substring.
	const rows = await db
		.select({ id: users.id, email: users.email, name: users.name, partnerId: users.partnerId, anniversary: users.partnerAnniversary })
		.from(users)
		.where(
			sql`${users.partnerAnniversary} IS NOT NULL
				AND ${users.partnerId} IS NOT NULL
				AND ${users.banned} = false
				AND CAST(substr(${users.partnerAnniversary}, 6, 2) AS INTEGER) = ${month}
				AND CAST(substr(${users.partnerAnniversary}, 9, 2) AS INTEGER) = ${day}`
		)

	if (rows.length === 0) return 0
	const partnerIds = rows.map(r => r.partnerId!).filter(Boolean)
	const partners = partnerIds.length
		? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, partnerIds))
		: []
	const partnerNameById = new Map(partners.map(p => [p.id, p.name ?? p.email]))

	let sent = 0
	for (const u of rows) {
		const partnerName = u.partnerId ? partnerNameById.get(u.partnerId) : undefined
		if (!partnerName) continue
		try {
			await sendPartnerAnniversaryReminderEmail(u.email, { name: u.name ?? u.email, partnerName, leadDays })
			sent += 1
		} catch {
			/* logged in resend */
		}
	}
	return sent
}
