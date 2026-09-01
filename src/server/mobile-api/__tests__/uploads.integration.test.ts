// Route-level integration tests for the mobile upload endpoints
// (src/server/mobile-api/v1/uploads.ts).
//
// The permission checks are the thing under test, so storage is the only
// mocked boundary: a fake StorageAdapter is injected via
// `_setStorageForTesting` and everything else (apiKey auth, canEditList,
// the sharp image pipeline, the DB writes) runs for real against the
// per-worker pglite instance.
//
// Cases:
//   1. Authenticated user updates their own avatar; users.image reflects it.
//   2. List owner sets items.imageUrl on their item.
//   3. A listEditors editor can also set items.imageUrl.
//   4. A user with no edit access gets 403 not-authorized; row unchanged.
//   5. Unauthenticated requests are rejected with 401.
//   6. Non-image bytes are rejected with 400 bad-mime; row unchanged.
//   7. Oversized payloads are rejected with 413 too-large.

import { makeItem, makeList, makeListEditor } from '@test/integration/factories'
import { eq, inArray } from 'drizzle-orm'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import { apikey, appSettings, items, lists, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { mobileSignInLimiter } from '@/lib/rate-limits'
import { _setStorageForTesting, type StorageAdapter } from '@/lib/storage/adapter'

import { mobileApp } from '../app'

const TEST_PASSWORD = 'integration-test-password'

type FakeStorage = StorageAdapter & {
	uploads: Array<{ key: string; buffer: Buffer; contentType: string }>
}

function makeFakeStorage(): FakeStorage {
	const uploads: FakeStorage['uploads'] = []
	const adapter: FakeStorage = {
		uploads,
		upload: vi.fn((key: string, buffer: Buffer, contentType: string) => {
			uploads.push({ key, buffer, contentType })
			return Promise.resolve()
		}),
		delete: vi.fn(() => Promise.resolve()),
		stream: vi.fn(),
		list: vi.fn(),
		ready: vi.fn(),
		getPublicUrl: (key: string) => `https://cdn.test/${key}`,
	}
	return adapter
}

let tinyPngCache: Buffer | undefined

async function makeTinyPng(): Promise<Buffer> {
	if (!tinyPngCache) {
		tinyPngCache = await sharp({
			create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 200, b: 0 } },
		})
			.png()
			.toBuffer()
	}
	return tinyPngCache
}

async function enableMobileApp(): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: true })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: true } })
}

const createdUserIds: Array<string> = []
const createdListIds: Array<number> = []

async function signUpUser(name: string): Promise<{ userId: string; email: string }> {
	const email = `upload-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
	const res = await auth.api.signUpEmail({
		body: { name: `Upload ${name}`, email, password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (res.status !== 200) throw new Error(`signUpEmail failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { user: { id: string } }
	createdUserIds.push(body.user.id)
	return { userId: body.user.id, email }
}

async function signInForKey(email: string): Promise<string> {
	const res = await mobileApp.fetch(
		new Request('http://t/api/mobile/v1/sign-in', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: TEST_PASSWORD, deviceName: 'Upload Test iPhone' }),
		})
	)
	if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { apiKey: string }
	return body.apiKey
}

function multipartRequest(url: string, bytes: Buffer | Uint8Array, apiKey?: string): Request {
	const form = new FormData()
	form.append('file', new File([bytes as BlobPart], 'upload.png', { type: 'image/png' }))
	return new Request(url, {
		method: 'POST',
		headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
		body: form,
	})
}

describe('mobile upload routes', () => {
	beforeEach(async () => {
		await mobileSignInLimiter._resetForTesting()
		_setStorageForTesting(makeFakeStorage())
		await enableMobileApp()
	})

	afterEach(async () => {
		_setStorageForTesting(undefined)
		if (createdListIds.length > 0) {
			await db.delete(items).where(inArray(items.listId, createdListIds))
			await db.delete(lists).where(inArray(lists.id, createdListIds))
			createdListIds.length = 0
		}
		if (createdUserIds.length > 0) {
			await db.delete(apikey).where(inArray(apikey.userId, createdUserIds))
			await db.delete(users).where(inArray(users.id, createdUserIds))
			createdUserIds.length = 0
		}
	})

	it('avatar upload updates the caller’s own users.image', async () => {
		const { userId, email } = await signUpUser('avatar')
		const apiKey = await signInForKey(email)
		const png = await makeTinyPng()

		const res = await mobileApp.fetch(multipartRequest('http://t/api/mobile/v1/me/avatar', png, apiKey))
		expect(res.status).toBe(200)
		const body = (await res.json()) as { url: string }
		expect(body.url).toMatch(new RegExp(`^https://cdn\\.test/avatars/${userId}-[0-9A-Za-z]+\\.webp$`))

		const row = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { image: true } })
		expect(row?.image).toBe(body.url)
	})

	it('list owner can set items.imageUrl on their own item', async () => {
		const { userId, email } = await signUpUser('owner')
		const apiKey = await signInForKey(email)
		const list = await makeList(db, { ownerId: userId })
		createdListIds.push(list.id)
		const item = await makeItem(db, { listId: list.id })
		const png = await makeTinyPng()

		const res = await mobileApp.fetch(multipartRequest(`http://t/api/mobile/v1/items/${item.id}/image`, png, apiKey))
		expect(res.status).toBe(200)
		const body = (await res.json()) as { url: string }
		expect(body.url).toMatch(new RegExp(`^https://cdn\\.test/items/${item.id}/[0-9A-Za-z]+\\.webp$`))

		const row = await db.query.items.findFirst({ where: eq(items.id, item.id), columns: { imageUrl: true } })
		expect(row?.imageUrl).toBe(body.url)
	})

	it('a listEditors editor can set items.imageUrl on the owner’s item', async () => {
		const owner = await signUpUser('editowner')
		const editor = await signUpUser('editor')
		const editorKey = await signInForKey(editor.email)
		const list = await makeList(db, { ownerId: owner.userId })
		createdListIds.push(list.id)
		const item = await makeItem(db, { listId: list.id })
		await makeListEditor(db, { listId: list.id, userId: editor.userId, ownerId: owner.userId })
		const png = await makeTinyPng()

		const res = await mobileApp.fetch(multipartRequest(`http://t/api/mobile/v1/items/${item.id}/image`, png, editorKey))
		expect(res.status).toBe(200)

		const row = await db.query.items.findFirst({ where: eq(items.id, item.id), columns: { imageUrl: true } })
		expect(row?.imageUrl).toMatch(/^https:\/\/cdn\.test\/items\//)
	})

	it('a user with no edit access gets 403 and the row is unchanged', async () => {
		const owner = await signUpUser('victim')
		const stranger = await signUpUser('stranger')
		const strangerKey = await signInForKey(stranger.email)
		const list = await makeList(db, { ownerId: owner.userId })
		createdListIds.push(list.id)
		const item = await makeItem(db, { listId: list.id, imageUrl: 'https://cdn.test/items/existing/original.webp' })
		const png = await makeTinyPng()

		const res = await mobileApp.fetch(multipartRequest(`http://t/api/mobile/v1/items/${item.id}/image`, png, strangerKey))
		expect(res.status).toBe(403)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('not-authorized')

		const row = await db.query.items.findFirst({ where: eq(items.id, item.id), columns: { imageUrl: true } })
		expect(row?.imageUrl).toBe('https://cdn.test/items/existing/original.webp')
	})

	it('unauthenticated requests are rejected with 401', async () => {
		const png = await makeTinyPng()

		const avatarRes = await mobileApp.fetch(multipartRequest('http://t/api/mobile/v1/me/avatar', png))
		expect(avatarRes.status).toBe(401)

		const itemRes = await mobileApp.fetch(multipartRequest('http://t/api/mobile/v1/items/1/image', png))
		expect(itemRes.status).toBe(401)
	})

	it('non-image bytes are rejected with 400 bad-mime and the row is unchanged', async () => {
		const { userId, email } = await signUpUser('badmime')
		const apiKey = await signInForKey(email)
		const notAnImage = Buffer.from('this is definitely not an image, just some text bytes padded out')

		const res = await mobileApp.fetch(multipartRequest('http://t/api/mobile/v1/me/avatar', notAnImage, apiKey))
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('bad-mime')

		const row = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { image: true } })
		expect(row?.image).toBeNull()
	})

	it('payloads over the size cap are rejected with 413 too-large', async () => {
		const { email } = await signUpUser('toolarge')
		const apiKey = await signInForKey(email)
		// STORAGE_MAX_UPLOAD_MB defaults to 8; the size gate fires before any
		// byte inspection, so plain zeros are enough.
		const oversized = Buffer.alloc(8 * 1024 * 1024 + 1)

		const res = await mobileApp.fetch(multipartRequest('http://t/api/mobile/v1/me/avatar', oversized, apiKey))
		expect(res.status).toBe(413)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('too-large')
	})
})
