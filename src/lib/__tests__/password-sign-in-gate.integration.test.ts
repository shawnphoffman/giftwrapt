// The `passwordSignInAdminsOnly` setting (plan 41). While it is in effect,
// only admins may sign in with a password, on the web endpoint and the mobile
// `POST /v1/sign-in`, email sign-up is closed, and the mobile capabilities
// probe reports `password: false`. It is in effect only while OIDC is
// configured and was loaded at boot, and it can only be turned on by an admin
// who has a password, with OIDC working.

import { eq, inArray, like } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { account, apikey, appSettings, rateLimit, session as sessionTable, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import {
	isPasswordSignInAdminsOnly,
	isPasswordSignInAllowedFor,
	passwordAdminsOnlyEnableBlocker,
	setOidcLoadedAtBoot,
} from '@/lib/password-sign-in-gate'
import { mobileSignInLimiter } from '@/lib/rate-limits'
import { encryptOidcClientSecrets } from '@/lib/settings-loader'
import { isSignUpOpen } from '@/lib/sign-up-gate'
import { mobileApp } from '@/server/mobile-api/app'

const BASE = 'http://localhost:3001'
const PASSWORD = 'integration-test-password'
const EMAIL_PREFIX = 'password-gate-'

function freshEmail(): string {
	return `${EMAIL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
}

function webPost(path: string, body: Record<string, unknown>): Promise<Response> {
	return auth.handler(
		new Request(`${BASE}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: BASE },
			body: JSON.stringify(body),
		})
	)
}

function webSignIn(email: string, password = PASSWORD): Promise<Response> {
	return webPost('/api/auth/sign-in/email', { email, password })
}

async function mobileSignIn(email: string, password = PASSWORD): Promise<Response> {
	return await mobileApp.fetch(
		new Request('http://t/api/mobile/v1/sign-in', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password, deviceName: 'Gate Test' }),
		})
	)
}

async function capabilities(): Promise<{ password: boolean; oidc: Array<{ id: string }> }> {
	const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/auth/capabilities'))
	expect(res.status).toBe(200)
	return (await res.json()) as { password: boolean; oidc: Array<{ id: string }> }
}

async function setSetting(key: string, value: unknown): Promise<void> {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

async function setOidc(enabled: boolean): Promise<void> {
	await setSetting(
		'oidcClient',
		encryptOidcClientSecrets({
			enabled,
			issuerUrl: 'https://idp.test/realm',
			authorizationUrl: '',
			tokenUrl: '',
			userinfoUrl: '',
			jwksUrl: '',
			logoutUrl: '',
			clientId: 'test-client-id',
			clientSecret: 'test-client-secret',
			scopes: [],
			buttonText: '',
			matchExistingUsersBy: 'none',
			autoRegister: true,
		})
	)
}

/** OIDC configured and loaded, setting on. */
async function putInEffect(): Promise<void> {
	await setOidc(true)
	setOidcLoadedAtBoot(true)
	await setSetting('passwordSignInAdminsOnly', true)
}

async function createUser(role: 'admin' | 'user' = 'user'): Promise<{ id: string; email: string }> {
	const email = freshEmail()
	const res = await auth.api.signUpEmail({ body: { name: 'Gate User', email, password: PASSWORD } as never, asResponse: true })
	if (res.status !== 200) throw new Error(`signUpEmail failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { user: { id: string } }
	await db.update(users).set({ role }).where(eq(users.id, body.user.id))
	return { id: body.user.id, email }
}

describe('passwordSignInAdminsOnly', () => {
	beforeEach(async () => {
		await db.delete(rateLimit)
		await mobileSignInLimiter._resetForTesting()
		await setSetting('enableMobileApp', true)
	})

	afterEach(async () => {
		const created = await db
			.select({ id: users.id })
			.from(users)
			.where(like(users.email, `${EMAIL_PREFIX}%`))
		const ids = created.map(u => u.id)
		if (ids.length > 0) {
			await db.delete(apikey).where(inArray(apikey.userId, ids))
			await db.delete(sessionTable).where(inArray(sessionTable.userId, ids))
			await db.delete(users).where(inArray(users.id, ids))
		}
		await db
			.delete(appSettings)
			.where(inArray(appSettings.key, ['passwordSignInAdminsOnly', 'oidcClient', 'enableMobileApp', 'enableSignUps', 'mobileApp']))
		setOidcLoadedAtBoot(false)
	})

	describe('while off', () => {
		it('lets anyone sign in with a password, on the web and mobile', async () => {
			const user = await createUser()

			expect((await webSignIn(user.email)).status).toBe(200)
			expect((await mobileSignIn(user.email)).status).toBe(200)
			expect((await capabilities()).password).toBe(true)
		})
	})

	describe('while in effect', () => {
		it('refuses a non-admin on the web with the same answer as a wrong password', async () => {
			const user = await createUser()
			await createUser('admin')
			const wrong = await webSignIn(user.email, 'not-the-password')
			await putInEffect()

			const refused = await webSignIn(user.email)

			expect(refused.status).toBe(wrong.status)
			expect(((await refused.json()) as { code?: string }).code).toBe(((await wrong.json()) as { code?: string }).code)
			expect(await isPasswordSignInAllowedFor(user.email)).toBe(false)
		})

		it('refuses a non-admin on mobile with the same answer as a wrong password', async () => {
			const user = await createUser()
			const wrong = await mobileSignIn(user.email, 'not-the-password')
			await putInEffect()

			const refused = await mobileSignIn(user.email)

			expect(refused.status).toBe(401)
			expect(await refused.json()).toEqual(await wrong.json())
		})

		it('matches the email without regard to case', async () => {
			const user = await createUser()
			await putInEffect()

			expect(await isPasswordSignInAllowedFor(user.email.toUpperCase())).toBe(false)
		})

		it('still lets an admin sign in with a password, on the web and mobile', async () => {
			const admin = await createUser('admin')
			await putInEffect()

			expect((await webSignIn(admin.email)).status).toBe(200)
			expect((await mobileSignIn(admin.email)).status).toBe(200)
		})

		it('reports password: false to the iOS app', async () => {
			await putInEffect()

			expect((await capabilities()).password).toBe(false)
		})

		it('closes email sign-up, but not on a deployment with no admin', async () => {
			await createUser('admin')
			await putInEffect()
			const email = freshEmail()

			const res = await webPost('/api/auth/sign-up/email', { name: 'Gate User', email, password: PASSWORD })

			expect(res.status).toBe(403)
			expect(await isSignUpOpen()).toBe(false)

			await db.update(users).set({ role: 'user' }).where(eq(users.role, 'admin'))
			expect(await isSignUpOpen()).toBe(true)
		})
	})

	describe('needs working OIDC', () => {
		it('has no effect while OIDC is turned off', async () => {
			const user = await createUser()
			await putInEffect()
			await setOidc(false)

			expect(await isPasswordSignInAdminsOnly()).toBe(false)
			expect((await webSignIn(user.email)).status).toBe(200)
			expect((await capabilities()).password).toBe(true)
		})

		it('has no effect until the server has loaded OIDC', async () => {
			const user = await createUser()
			await putInEffect()
			setOidcLoadedAtBoot(false)

			expect(await isPasswordSignInAdminsOnly()).toBe(false)
			expect((await webSignIn(user.email)).status).toBe(200)
		})
	})

	describe('turning it on', () => {
		it('is refused while OIDC is not working', async () => {
			const admin = await createUser('admin')

			expect(await passwordAdminsOnlyEnableBlocker(admin.id)).toBe('needs-oidc')

			await setOidc(true)
			expect(await passwordAdminsOnlyEnableBlocker(admin.id)).toBe('needs-oidc')
		})

		it('is refused for an admin with no password', async () => {
			const admin = await createUser('admin')
			await db.update(account).set({ password: null }).where(eq(account.userId, admin.id))
			await setOidc(true)
			setOidcLoadedAtBoot(true)

			expect(await passwordAdminsOnlyEnableBlocker(admin.id)).toBe('needs-password')
		})

		it('is allowed for an admin with a password while OIDC works', async () => {
			const admin = await createUser('admin')
			await setOidc(true)
			setOidcLoadedAtBoot(true)

			expect(await passwordAdminsOnlyEnableBlocker(admin.id)).toBeNull()
		})

		it('is not checked again once it is on', async () => {
			const admin = await createUser('admin')
			await db.update(account).set({ password: null }).where(eq(account.userId, admin.id))
			await putInEffect()

			expect(await passwordAdminsOnlyEnableBlocker(admin.id)).toBeNull()
		})
	})

	describe('mobile OIDC button', () => {
		it('is listed only while a mobile redirect URI is configured', async () => {
			await setOidc(true)
			expect((await capabilities()).oidc.map(p => p.id)).toEqual(['oidc'])

			await setSetting('mobileApp', { redirectUris: [] })
			expect((await capabilities()).oidc).toEqual([])
		})
	})
})
