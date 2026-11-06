// Partner and role are server-owned, so better-auth's own endpoints must not
// accept them from a client. Picking a partner goes through
// `applyPartnerAndAnniversary` (src/lib/partner-update.ts), which enforces the
// child rule and keeps both rows in step. POST /api/auth/update-user skips all
// of that, and gift credit and receipts trust `users.partnerId`, so a
// self-written value would read another person's purchases.

import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { rateLimit, session as sessionTable, users } from '@/db/schema'
import { auth } from '@/lib/auth'

const BASE = 'http://localhost:3001'
const TEST_PASSWORD = 'integration-test-password'

const createdUserIds: Array<string> = []

function freshEmail(): string {
	return `partner-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
}

function mergeCookies(existing: string, response: Response): string {
	const jar = new Map(
		existing
			.split('; ')
			.filter(Boolean)
			.map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)])
	)
	for (const header of response.headers.getSetCookie()) {
		const pair = header.split(';')[0]
		jar.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1))
	}
	return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
}

async function signUp(): Promise<{ id: string; cookie: string }> {
	const res = await auth.api.signUpEmail({
		body: { name: 'Partner Input Test', email: freshEmail(), password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (res.status !== 200) throw new Error(`signUpEmail failed: ${res.status} ${await res.text()}`)
	const { user } = (await res.json()) as { user: { id: string } }
	createdUserIds.push(user.id)
	return { id: user.id, cookie: mergeCookies('', res) }
}

function updateUser(cookie: string, body: Record<string, unknown>): Promise<Response> {
	return auth.handler(
		new Request(`${BASE}/api/auth/update-user`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: BASE, cookie },
			body: JSON.stringify(body),
		})
	)
}

async function storedUser(id: string) {
	return db.query.users.findFirst({
		where: (u, { eq: ueq }) => ueq(u.id, id),
		columns: { partnerId: true, partnerAnniversary: true, role: true },
	})
}

describe('better-auth user input', () => {
	beforeEach(async () => {
		await db.delete(rateLimit)
	})

	afterEach(async () => {
		if (createdUserIds.length > 0) {
			await db.update(users).set({ partnerId: null }).where(inArray(users.id, createdUserIds))
			await db.delete(sessionTable).where(inArray(sessionTable.userId, createdUserIds))
			await db.delete(users).where(inArray(users.id, createdUserIds))
			createdUserIds.length = 0
		}
	})

	it('refuses partnerId on update-user', async () => {
		const attacker = await signUp()
		const victim = await signUp()

		const res = await updateUser(attacker.cookie, { partnerId: victim.id })

		expect(res.status).toBe(400)
		expect((await storedUser(attacker.id))?.partnerId).toBeNull()
	})

	it('refuses partnerAnniversary on update-user', async () => {
		const user = await signUp()

		const res = await updateUser(user.cookie, { partnerAnniversary: '2020-01-01' })

		expect(res.status).toBe(400)
		expect((await storedUser(user.id))?.partnerAnniversary).toBeNull()
	})

	it('refuses role on update-user', async () => {
		await signUp() // takes the first-admin bootstrap if the database has no admin
		const user = await signUp()
		const before = await storedUser(user.id)

		const res = await updateUser(user.cookie, { role: 'admin' })

		expect(res.status).toBe(400)
		expect((await storedUser(user.id))?.role).toBe(before?.role)
	})

	it('refuses partnerId on sign-up', async () => {
		const victim = await signUp()

		const res = await auth.api.signUpEmail({
			body: { name: 'Partner Input Test', email: freshEmail(), password: TEST_PASSWORD, partnerId: victim.id } as never,
			asResponse: true,
		})

		expect(res.status).toBe(400)
	})

	// updateUserProfile writes the partner in its own transaction, then calls
	// auth.api.updateUser with the rest so the session cookie picks up the new
	// row. The settings form and the next profile save both read the partner
	// from the session, so it must not go stale.
	it('still refreshes the session with a partner written by the server', async () => {
		const user = await signUp()
		const partner = await signUp()
		await db.update(users).set({ partnerId: partner.id }).where(eq(users.id, user.id))

		const res = await updateUser(user.cookie, { name: 'Partner Input Renamed' })
		expect(res.status).toBe(200)

		const session = await auth.handler(
			new Request(`${BASE}/api/auth/get-session`, { headers: { origin: BASE, cookie: mergeCookies(user.cookie, res) } })
		)
		const body = (await session.json()) as { user: { partnerId: string | null } }
		expect(body.user.partnerId).toBe(partner.id)
	})
})
