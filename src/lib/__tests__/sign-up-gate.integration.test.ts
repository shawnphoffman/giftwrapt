// The `enableSignUps` setting closes public sign-up without locking anyone out:
// first-admin setup still works on a deployment with no admin, and admins and
// server-side scripts can still create accounts.

import { eq, inArray, like } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings, rateLimit, session as sessionTable, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { isSignUpOpen } from '@/lib/sign-up-gate'

const BASE = 'http://localhost:3001'
const PASSWORD = 'integration-test-password'
const EMAIL_PREFIX = 'sign-up-gate-'

function freshEmail(): string {
	return `${EMAIL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
}

function post(path: string, body: Record<string, unknown>, cookie?: string): Promise<Response> {
	return auth.handler(
		new Request(`${BASE}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) },
			body: JSON.stringify(body),
		})
	)
}

function publicSignUp(email: string, path = '/api/auth/sign-up/email'): Promise<Response> {
	return post(path, { name: 'Sign Up Gate', email, password: PASSWORD })
}

async function setSignUps(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableSignUps', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

async function stored(email: string) {
	return db.query.users.findFirst({ where: (u, { eq: ueq }) => ueq(u.email, email), columns: { id: true, role: true } })
}

async function ensureAdmin(): Promise<string> {
	const email = freshEmail()
	const res = await auth.api.signUpEmail({ body: { name: 'Gate Admin', email, password: PASSWORD } as never, asResponse: true })
	if (res.status !== 200) throw new Error(`signUpEmail failed: ${res.status} ${await res.text()}`)
	await db.update(users).set({ role: 'admin' }).where(eq(users.email, email))
	return email
}

describe('enableSignUps', () => {
	beforeEach(async () => {
		await db.delete(rateLimit)
	})

	afterEach(async () => {
		const created = await db
			.select({ id: users.id })
			.from(users)
			.where(like(users.email, `${EMAIL_PREFIX}%`))
		const ids = created.map(u => u.id)
		if (ids.length > 0) {
			await db.delete(sessionTable).where(inArray(sessionTable.userId, ids))
			await db.delete(users).where(inArray(users.id, ids))
		}
		await db.delete(appSettings).where(eq(appSettings.key, 'enableSignUps'))
	})

	it('leaves sign-up open by default', async () => {
		await ensureAdmin()
		const email = freshEmail()

		const res = await publicSignUp(email)

		expect(res.status).toBe(200)
		expect(await stored(email)).toBeDefined()
	})

	it('refuses public sign-up when off and an admin exists', async () => {
		await ensureAdmin()
		await setSignUps(false)
		const email = freshEmail()

		const res = await publicSignUp(email)

		expect(res.status).toBe(403)
		expect(await stored(email)).toBeUndefined()
		expect(await isSignUpOpen()).toBe(false)
	})

	it('refuses the same route with a trailing slash', async () => {
		await ensureAdmin()
		await setSignUps(false)
		const email = freshEmail()

		await publicSignUp(email, '/api/auth/sign-up/email/')

		expect(await stored(email)).toBeUndefined()
	})

	it('reopens when switched back on', async () => {
		await ensureAdmin()
		await setSignUps(false)
		await setSignUps(true)
		const email = freshEmail()

		const res = await publicSignUp(email)

		expect(res.status).toBe(200)
		expect(await isSignUpOpen()).toBe(true)
	})

	it('still lets the first admin sign up on a deployment with no admin', async () => {
		await db.update(users).set({ role: 'user' }).where(eq(users.role, 'admin'))
		await setSignUps(false)
		const email = freshEmail()

		expect(await isSignUpOpen()).toBe(true)
		const res = await publicSignUp(email)

		expect(res.status).toBe(200)
		expect((await stored(email))?.role).toBe('admin')
	})

	it('still lets server-side scripts create accounts when off', async () => {
		await ensureAdmin()
		await setSignUps(false)
		const email = freshEmail()

		const res = await auth.api.signUpEmail({ body: { name: 'Script User', email, password: PASSWORD } as never, asResponse: true })

		expect(res.status).toBe(200)
		expect(await stored(email)).toBeDefined()
	})

	it('still lets an admin create users when off', async () => {
		const adminEmail = await ensureAdmin()
		await setSignUps(false)
		const signIn = await post('/api/auth/sign-in/email', { email: adminEmail, password: PASSWORD })
		const cookie = signIn.headers
			.getSetCookie()
			.map(header => header.split(';')[0])
			.join('; ')
		const email = freshEmail()

		const res = await post('/api/auth/admin/create-user', { name: 'Added By Admin', email, password: PASSWORD, role: 'user' }, cookie)

		expect(res.status).toBe(200)
		expect(await stored(email)).toBeDefined()
	})
})
