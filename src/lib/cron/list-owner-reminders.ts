// Phase B pre-event reminder fan-out. Runs as part of the daily
// birthday-emails cron. Three independent families, each gated on
// (enableXLists + enableXReminderEmails) and parameterized by
// xReminderLeadDays:
//
//   - Birthday: per-user check, fires when (today + leadDays) matches
//     U's birthMonth/Day. Single recipient per match.
//   - Christmas: one global trigger when today + leadDays === Dec 25.
//     Broadcasts to every user. Idempotent via an app_settings flag
//     keyed on the year, so cron retries the same day don't double-send.
//   - Custom Holiday: for each customHolidays row, fires when
//     (today + leadDays) === nextOccurrence. Broadcasts to every user.
//     Idempotent via `custom_holiday_reminder_logs(holidayId, year)`.

import { eq, sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { appSettings, type BirthMonth, birthMonthEnumValues, customHolidayReminderLogs, customHolidays, users } from '@/db/schema'
import { customHolidayNextOccurrence, isSameUtcDay, startOfUtcDay } from '@/lib/custom-holidays'
import { sendPreBirthdayReminderEmail, sendPreChristmasReminderEmail, sendPreCustomHolidayReminderEmail } from '@/lib/resend'

export type ListOwnerRemindersResult = {
	birthdayReminders: number
	christmasReminders: number
	customHolidayReminders: number
}

type Args = {
	db: SchemaDatabase
	now: Date
	settings: {
		enableBirthdayLists: boolean
		enableBirthdayReminderEmails: boolean
		birthdayReminderLeadDays: number
		enableChristmasLists: boolean
		enableChristmasReminderEmails: boolean
		christmasReminderLeadDays: number
		enableGenericHolidayLists: boolean
		enableHolidayReminderEmails: boolean
		holidayReminderLeadDays: number
	}
}

export async function listOwnerRemindersImpl({ db, now, settings }: Args): Promise<ListOwnerRemindersResult> {
	const out: ListOwnerRemindersResult = {
		birthdayReminders: 0,
		christmasReminders: 0,
		customHolidayReminders: 0,
	}

	if (settings.enableBirthdayLists && settings.enableBirthdayReminderEmails) {
		out.birthdayReminders = await sendBirthdayReminders(db, now, settings.birthdayReminderLeadDays)
	}

	if (settings.enableChristmasLists && settings.enableChristmasReminderEmails) {
		out.christmasReminders = await sendChristmasReminders(db, now, settings.christmasReminderLeadDays)
	}

	if (settings.enableGenericHolidayLists && settings.enableHolidayReminderEmails) {
		out.customHolidayReminders = await sendCustomHolidayReminders(db, now, settings.holidayReminderLeadDays)
	}

	return out
}

async function sendBirthdayReminders(db: SchemaDatabase, now: Date, leadDays: number): Promise<number> {
	const target = new Date(now)
	target.setUTCDate(target.getUTCDate() + leadDays)
	const monthIndex = target.getUTCMonth() // 0-11
	const day = target.getUTCDate()
	const birthMonth: BirthMonth = birthMonthEnumValues[monthIndex]

	const rows = await db
		.select({ id: users.id, email: users.email, name: users.name })
		.from(users)
		.where(sql`${users.birthMonth} = ${birthMonth} AND ${users.birthDay} = ${day} AND ${users.banned} = false`)

	let sent = 0
	for (const u of rows) {
		try {
			await sendPreBirthdayReminderEmail(u.email, { name: u.name ?? u.email, leadDays })
			sent += 1
		} catch {
			// per-recipient failures logged inline in resend
		}
	}
	return sent
}

// Christmas is always Dec 25. We fire when (today + leadDays) == Dec 25
// of the current calendar year. Idempotency: a single row in appSettings
// keyed by `__lastChristmasReminderYear` holds the year of the most
// recent send, so same-day cron retries skip.
async function sendChristmasReminders(db: SchemaDatabase, now: Date, leadDays: number): Promise<number> {
	const target = new Date(now)
	target.setUTCDate(target.getUTCDate() + leadDays)
	const isChristmas = target.getUTCMonth() === 11 && target.getUTCDate() === 25
	if (!isChristmas) return 0

	const year = target.getUTCFullYear()
	const flagKey = '__lastChristmasReminderYear'
	const existing = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, flagKey)).limit(1)
	if (existing[0] && existing[0].value === year) return 0

	const recipients = await db
		.select({ id: users.id, email: users.email, name: users.name })
		.from(users)
		.where(sql`${users.banned} = false`)

	let sent = 0
	for (const u of recipients) {
		try {
			await sendPreChristmasReminderEmail(u.email, { name: u.name ?? u.email, leadDays })
			sent += 1
		} catch {
			/* logged in resend */
		}
	}

	// Mark sent for this year.
	await db
		.insert(appSettings)
		.values({ key: flagKey, value: year })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: year } })

	return sent
}

async function sendCustomHolidayReminders(db: SchemaDatabase, now: Date, leadDays: number): Promise<number> {
	const target = new Date(now)
	target.setUTCDate(target.getUTCDate() + leadDays)
	const targetDay = startOfUtcDay(target)

	const holidays = await db.select().from(customHolidays)
	if (holidays.length === 0) return 0

	let totalSent = 0
	for (const h of holidays) {
		const occurrence = await customHolidayNextOccurrence(h, now, db)
		if (!occurrence) continue
		if (!isSameUtcDay(occurrence, targetDay)) continue

		const occurrenceYear = occurrence.getUTCFullYear()
		const existing = await db
			.select({ id: customHolidayReminderLogs.id })
			.from(customHolidayReminderLogs)
			.where(
				sql`${customHolidayReminderLogs.customHolidayId} = ${h.id} AND ${customHolidayReminderLogs.occurrenceYear} = ${occurrenceYear}`
			)
			.limit(1)
		if (existing.length > 0) continue

		const recipients = await db
			.select({ id: users.id, email: users.email, name: users.name })
			.from(users)
			.where(sql`${users.banned} = false`)

		for (const u of recipients) {
			try {
				await sendPreCustomHolidayReminderEmail(u.email, {
					name: u.name ?? u.email,
					holidayName: h.title,
					leadDays,
				})
				totalSent += 1
			} catch {
				/* logged in resend */
			}
		}

		await db.insert(customHolidayReminderLogs).values({ customHolidayId: h.id, occurrenceYear })
	}

	return totalSent
}
