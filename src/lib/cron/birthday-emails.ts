// Server-only impl for the /api/cron/birthday-emails route. Lives
// outside the routes folder so integration tests can drive the
// email-selection logic with a transactional `db` (per-test savepoint
// via withRollback) while the email-send side-effects get vi.mock'd at
// the resend module boundary.

import { and, eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'
import { calendarDayInZone } from '@/lib/calendar-day'
import { fanOutToGuardians } from '@/lib/guardian-emails'
import { sendBirthdayEmail } from '@/lib/resend'

const MONTHS: ReadonlyArray<BirthMonth> = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december',
]

export type BirthdayEmailsResult = {
	birthdayEmails: number
}

type Args = {
	db: SchemaDatabase
	now: Date
	// Deployment time zone (`appSettings.timeZone`); decides which date
	// "today" is. Defaults to UTC.
	timeZone?: string
}

export async function birthdayEmailsImpl({ db, now, timeZone }: Args): Promise<BirthdayEmailsResult> {
	const today = calendarDayInZone(now, timeZone)
	const todayMonth = MONTHS[today.getUTCMonth()]
	const todayDay = today.getUTCDate()

	// === Day-of birthday emails ===
	const birthdayUsers = await db.query.users.findMany({
		where: and(eq(users.birthMonth, todayMonth), eq(users.birthDay, todayDay), eq(users.banned, false)),
		columns: { id: true, name: true, email: true },
	})

	let birthdaySent = 0
	for (const user of birthdayUsers) {
		try {
			await sendBirthdayEmail(user.name || 'there', user.email)
			birthdaySent += 1
		} catch {
			// Caller (handler) is responsible for logging; swallow here so a
			// single bad recipient doesn't kill the whole batch.
		}
		await fanOutToGuardians(db, user.id, g => sendBirthdayEmail(user.name || 'there', g.email))
	}

	return { birthdayEmails: birthdaySent }
}
