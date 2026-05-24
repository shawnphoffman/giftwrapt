// Fan-out helper for guardian email notifications. Whenever an email
// targets a user, we also fire the same email to every guardian listed
// in `guardianships` for that user. Users without guardianship rows
// (the common case) get a no-op, so callsites can call this
// unconditionally without first checking whether the recipient is a
// child account.

import { and, eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { guardianships, users } from '@/db/schema'
import { createLogger } from '@/lib/logger'

const guardianLog = createLogger('guardian-emails')

export type GuardianRecipient = {
	id: string
	email: string
	name: string | null
}

export async function getGuardianRecipients(db: SchemaDatabase, childUserId: string): Promise<Array<GuardianRecipient>> {
	return db
		.select({ id: users.id, email: users.email, name: users.name })
		.from(guardianships)
		.innerJoin(users, eq(users.id, guardianships.parentUserId))
		.where(and(eq(guardianships.childUserId, childUserId), eq(users.banned, false)))
}

// Calls `sendFn` once per guardian. Per-guardian failures are caught and
// logged so one bad recipient never blocks the rest of the fan-out.
// Returns the number of guardians the send was attempted for (regardless
// of provider-level success), matching the per-user counter semantics at
// existing callsites.
export async function fanOutToGuardians(
	db: SchemaDatabase,
	childUserId: string,
	sendFn: (recipient: GuardianRecipient) => Promise<unknown>
): Promise<number> {
	const guardians = await getGuardianRecipients(db, childUserId)
	let attempted = 0
	for (const guardian of guardians) {
		attempted += 1
		try {
			await sendFn(guardian)
		} catch (err) {
			guardianLog.warn(
				{ err: err instanceof Error ? err.message : String(err), childUserId, guardianId: guardian.id },
				'guardian fan-out send failed'
			)
		}
	}
	return attempted
}
