// GET /v1/gift-exchanges (plan 39, slice 39f): the iOS Upcoming row and the
// Coming Up widget line. Runs against the assembled gateway with a real
// device key.
//
// The route must never carry the person the caller gives to (or anyone
// else), even after the caller has looked, and reading it must not count as
// looking.

import { makeUser } from '@test/integration/factories'
import { and, eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { archiveExchangeImpl, createExchangeImpl, drawExchangeImpl } from '@/api/_gift-exchanges-impl'
import { revealMyAssignmentImpl } from '@/api/_my-gift-exchanges-impl'
import { db } from '@/db'
import type { User } from '@/db/schema'
import { apikey, appSettings, giftExchangeMembers, giftExchanges, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { mobileSignInLimiter } from '@/lib/rate-limits'

import { mobileApp } from '../app'

const TEST_PASSWORD = 'integration-test-password'

let testEmail: string
let userId: string
let key: string
const createdUserIds: Array<string> = []
const createdExchangeIds: Array<string> = []

type Row = {
	id: string
	name: string
	giftDate: string
	budget: { amount: number; currency: string } | null
	state: 'ready' | 'seen' | 'changed'
}

async function setMobileApp(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

async function get(bearer: string | null = key): Promise<Response> {
	return mobileApp.fetch(
		new Request('http://t/api/mobile/v1/gift-exchanges', { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} })
	)
}

async function people(names: Array<string>): Promise<Array<User>> {
	const out: Array<User> = []
	for (const name of names) {
		const u = await makeUser(db, { name })
		createdUserIds.push(u.id)
		out.push(u)
	}
	return out
}

async function createExchange(
	memberUserIds: Array<string>,
	opts: { name?: string; budget?: number | null; giftDate?: string; draw?: boolean } = {}
): Promise<string> {
	const res = await createExchangeImpl({
		now: new Date('2026-11-01T12:00:00Z'),
		actorId: memberUserIds[0],
		input: {
			name: opts.name ?? 'Family',
			budget: opts.budget === undefined ? 50 : opts.budget,
			giftDate: opts.giftDate ?? '2026-12-25',
			memberUserIds,
		},
	})
	if (res.kind !== 'ok') throw new Error(`create failed: ${res.reason}`)
	createdExchangeIds.push(res.id)
	if (opts.draw !== false) {
		const drawn = await drawExchangeImpl({ exchangeId: res.id })
		if (drawn.kind !== 'ok') throw new Error(`draw failed: ${drawn.reason}`)
	}
	return res.id
}

async function myMember(exchangeId: string) {
	const [row] = await db
		.select()
		.from(giftExchangeMembers)
		.where(and(eq(giftExchangeMembers.exchangeId, exchangeId), eq(giftExchangeMembers.userId, userId)))
	return row
}

beforeEach(async () => {
	testEmail = `gift-exchanges-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
	await mobileSignInLimiter._resetForTesting()
	await setMobileApp(true)
	const signUp = await auth.api.signUpEmail({
		body: { name: 'Exchange Member', email: testEmail, password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (signUp.status !== 200) throw new Error(`signUpEmail failed: ${signUp.status}`)
	const res = await mobileApp.fetch(
		new Request('http://t/api/mobile/v1/sign-in', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD, deviceName: 'Exchange Phone' }),
		})
	)
	if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { apiKey: string; user: { id: string } }
	key = body.apiKey
	userId = body.user.id
})

afterEach(async () => {
	await setMobileApp(true)
	if (createdExchangeIds.length) await db.delete(giftExchanges).where(inArray(giftExchanges.id, createdExchangeIds.splice(0)))
	await db.delete(apikey).where(eq(apikey.userId, userId))
	await db.delete(users).where(inArray(users.id, [userId, ...createdUserIds.splice(0)]))
})

describe('GET /v1/gift-exchanges', () => {
	it('returns each drawn exchange the caller is in, soonest first, in the documented shape', async () => {
		const [bea, cal, dee] = await people(['Bea Baker', 'Cal Carter', 'Dee Dixon'])
		const later = await createExchange([userId, bea.id, cal.id], { name: 'Christmas 2026', budget: 50, giftDate: '2026-12-25' })
		const sooner = await createExchange([userId, cal.id, dee.id], { name: 'Office Swap', budget: null, giftDate: '2026-12-01' })

		const res = await get()
		expect(res.status).toBe(200)
		const body = (await res.json()) as { rows: Array<Row>; nextCursor: null }
		expect(body).toEqual({
			rows: [
				{ id: sooner, name: 'Office Swap', giftDate: '2026-12-01', budget: null, state: 'ready' },
				{ id: later, name: 'Christmas 2026', giftDate: '2026-12-25', budget: { amount: 50, currency: 'USD' }, state: 'ready' },
			],
			nextCursor: null,
		})
		for (const row of body.rows) expect(Object.keys(row).sort()).toEqual(['budget', 'giftDate', 'id', 'name', 'state'])
	})

	it('never carries the recipient or any other member, even after the caller has looked', async () => {
		const [bea, cal, dee] = await people(['Bea Baker', 'Cal Carter', 'Dee Dixon'])
		const exchangeId = await createExchange([userId, bea.id, cal.id, dee.id])
		const reveal = await revealMyAssignmentImpl({ userId, exchangeId })
		expect(reveal.kind).toBe('ok')
		const recipient = reveal.kind === 'ok' ? reveal.recipient : null
		expect(recipient).not.toBeNull()
		// The other members look too, so every pairing is live.
		for (const other of [bea, cal, dee]) await revealMyAssignmentImpl({ userId: other.id, exchangeId })

		const res = await get()
		expect(res.status).toBe(200)
		const raw = await res.text()
		const body = JSON.parse(raw) as { rows: Array<Row> }
		expect(body.rows).toHaveLength(1)
		expect(body.rows[0].state).toBe('seen')
		expect(raw).not.toContain(recipient!.id)
		expect(raw).not.toContain(recipient!.email)
		for (const other of [bea, cal, dee]) for (const t of [other.id, other.email, other.name!]) expect(raw).not.toContain(t)
		expect(raw).not.toContain(userId)
	})

	it('reports a replaced assignment as changed', async () => {
		const [bea, cal] = await people(['Bea', 'Cal'])
		const exchangeId = await createExchange([userId, bea.id, cal.id])
		await db
			.update(giftExchangeMembers)
			.set({ changedAt: new Date() })
			.where(and(eq(giftExchangeMembers.exchangeId, exchangeId), eq(giftExchangeMembers.userId, userId)))

		const body = (await (await get()).json()) as { rows: Array<Row> }
		expect(body.rows.map(r => r.state)).toEqual(['changed'])
	})

	it('does not count as looking', async () => {
		const [bea, cal] = await people(['Bea', 'Cal'])
		const exchangeId = await createExchange([userId, bea.id, cal.id])
		await get()
		await get()
		const member = await myMember(exchangeId)
		expect(member.seenAt).toBeNull()
		const body = (await (await get()).json()) as { rows: Array<Row> }
		expect(body.rows[0].state).toBe('ready')
	})

	it('leaves out never-drawn and archived exchanges', async () => {
		const [bea, cal] = await people(['Bea', 'Cal'])
		await createExchange([userId, bea.id, cal.id], { name: 'Undrawn', draw: false })
		const archived = await createExchange([userId, bea.id, cal.id], { name: 'Archived' })
		const done = await archiveExchangeImpl({ exchangeId: archived })
		expect(done.kind).toBe('ok')
		const open = await createExchange([userId, bea.id, cal.id], { name: 'Open' })

		const body = (await (await get()).json()) as { rows: Array<Row> }
		expect(body.rows.map(r => r.id)).toEqual([open])
	})

	it('gives a non-member an empty list', async () => {
		const [bea, cal, dee] = await people(['Bea', 'Cal', 'Dee'])
		await createExchange([bea.id, cal.id, dee.id])

		const res = await get()
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ rows: [], nextCursor: null })
	})

	it('refuses a request with no key or an unknown key', async () => {
		for (const bearer of [null, 'not-a-real-key']) {
			const res = await get(bearer)
			expect(res.status).toBe(401)
			const body = (await res.json()) as { error: { code: string } }
			expect(body.error.code).toBe('unauthorized')
		}
	})

	it('is off with the rest of the mobile API when the kill switch is off', async () => {
		await setMobileApp(false)
		const res = await get()
		expect(res.status).toBe(503)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('mobile-app-disabled')
	})
})
