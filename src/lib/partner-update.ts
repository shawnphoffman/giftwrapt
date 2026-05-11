import { eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { users } from '@/db/schema'

// Accept either the top-level db or a transaction (PgTransaction extends
// the same surface for `update` / `query.users.findFirst`). Callers in
// production always pass a transaction; tests can pass the
// withRollback-provided handle directly.
type Tx = SchemaDatabase

export type PartnerUpdateInput = {
	userId: string
	currentPartnerId: string | null
	// `undefined` = field not submitted; `null` = clear partner.
	newPartnerId: string | null | undefined
	// `undefined` = field not submitted; `null` or empty = clear anniversary.
	// Must be a YYYY-MM-DD string when set.
	newAnniversary: string | null | undefined
}

export type PartnerUpdateResult = {
	// What to merge into the caller's own `set(...)` payload so the caller
	// can batch this with other column updates (name, birthday, etc.).
	selfUpdates: { partnerId?: string | null; partnerAnniversary?: string | null }
}

// Mutates rows for the old partner (if any), the new partner's prior
// partner (if any), the new partner (if any), and returns the columns
// the caller should write to the user's OWN row.
//
// Anniversary is mirrored onto the partner so reads on either side see
// the same date without resolving it through the relationship; if the
// effective partnership is cleared (either by an explicit clear or
// because the user is unpartnered), anniversary is forced to null on
// both rows.
export async function applyPartnerAndAnniversary(tx: Tx, input: PartnerUpdateInput): Promise<PartnerUpdateResult> {
	const { userId, currentPartnerId, newPartnerId, newAnniversary } = input
	const effectivePartnerId = newPartnerId !== undefined ? newPartnerId : currentPartnerId
	const selfUpdates: PartnerUpdateResult['selfUpdates'] = {}

	if (newPartnerId !== undefined) {
		selfUpdates.partnerId = newPartnerId
		if (currentPartnerId && currentPartnerId !== newPartnerId) {
			await tx.update(users).set({ partnerId: null, partnerAnniversary: null }).where(eq(users.id, currentPartnerId))
		}
		if (newPartnerId) {
			const newPartner = await tx.query.users.findFirst({
				where: eq(users.id, newPartnerId),
				columns: { partnerId: true },
			})
			if (newPartner?.partnerId && newPartner.partnerId !== userId) {
				await tx.update(users).set({ partnerId: null, partnerAnniversary: null }).where(eq(users.id, newPartner.partnerId))
			}
			await tx.update(users).set({ partnerId: userId }).where(eq(users.id, newPartnerId))
		}
	}

	let anniversaryToWrite: string | null | undefined = undefined
	if (effectivePartnerId === null) {
		anniversaryToWrite = null
	} else if (newAnniversary !== undefined) {
		anniversaryToWrite = newAnniversary || null
	}
	if (anniversaryToWrite !== undefined) {
		selfUpdates.partnerAnniversary = anniversaryToWrite
		if (effectivePartnerId) {
			await tx.update(users).set({ partnerAnniversary: anniversaryToWrite }).where(eq(users.id, effectivePartnerId))
		}
	}

	return { selfUpdates }
}
