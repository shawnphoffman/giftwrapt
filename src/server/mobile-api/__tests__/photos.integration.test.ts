// Mobile photo routes: `POST /v1/products/by-photo`,
// `POST /v1/items/:itemId/image`, and the two flags
// `GET /v1/app-settings` reports for them.
//
// Runs against the assembled gateway with a real device key. Storage is
// a fake adapter; no AI provider is configured in the test env, so the
// photo lookup exercises its "not set up" path.

import { makeItem, makeList } from '@test/integration/factories'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import { apikey, appSettings, items, lists, users } from '@/db/schema'
import type * as EnvModule from '@/env'
import { auth } from '@/lib/auth'
import { mobileSignInLimiter, scrapeLimiter } from '@/lib/rate-limits'
import { _setStorageForTesting, type StorageAdapter } from '@/lib/storage/adapter'

import { mobileApp } from '../app'

vi.mock('@/env', async () => {
	const actual = await vi.importActual<typeof EnvModule>('@/env')
	return {
		...actual,
		env: {
			...actual.env,
			STORAGE_ENDPOINT: 'http://storage.test',
			STORAGE_REGION: 'us-east-1',
			STORAGE_BUCKET: 'test-bucket',
			STORAGE_ACCESS_KEY_ID: 'test-key',
			STORAGE_SECRET_ACCESS_KEY: 'test-secret',
			STORAGE_PUBLIC_URL: 'https://cdn.test',
			STORAGE_MAX_UPLOAD_MB: 8,
		},
	}
})

const TEST_PASSWORD = 'integration-test-password'

let testEmail: string
let userId: string
let key: string

function makeFakeStorage(): StorageAdapter {
	return {
		upload: vi.fn(() => Promise.resolve()),
		delete: vi.fn(() => Promise.resolve()),
		stream: vi.fn(),
		list: vi.fn(),
		ready: vi.fn(),
		getPublicUrl: (k: string) => `https://cdn.test/${k}`,
	}
}

async function tinyJpeg(): Promise<Buffer> {
	return sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 200 } } })
		.jpeg()
		.toBuffer()
}

function multipart(bytes: Buffer | string, type = 'image/jpeg'): FormData {
	const form = new FormData()
	const part = typeof bytes === 'string' ? bytes : new Uint8Array(bytes)
	form.append('file', new File([part], 'photo.jpg', { type }))
	return form
}

async function post(path: string, body?: FormData): Promise<Response> {
	return mobileApp.fetch(
		new Request(`http://t/api/mobile/v1${path}`, {
			method: 'POST',
			headers: { authorization: `Bearer ${key}` },
			body,
		})
	)
}

async function errorCode(res: Response): Promise<string> {
	const body = (await res.json()) as { error: { code: string } }
	return body.error.code
}

beforeEach(async () => {
	testEmail = `photos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
	await mobileSignInLimiter._resetForTesting()
	scrapeLimiter._resetForTesting()
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: true })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: true } })
	const signUp = await auth.api.signUpEmail({
		body: { name: 'Photo Test', email: testEmail, password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (signUp.status !== 200) throw new Error(`signUpEmail failed: ${signUp.status}`)
	const res = await mobileApp.fetch(
		new Request('http://t/api/mobile/v1/sign-in', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD, deviceName: 'Photo Phone' }),
		})
	)
	if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { apiKey: string; user: { id: string } }
	key = body.apiKey
	userId = body.user.id
	_setStorageForTesting(makeFakeStorage())
})

afterEach(async () => {
	_setStorageForTesting(undefined)
	const ownLists = await db.query.lists.findMany({ where: eq(lists.ownerId, userId), columns: { id: true } })
	for (const l of ownLists) {
		await db.delete(items).where(eq(items.listId, l.id))
		await db.delete(lists).where(eq(lists.id, l.id))
	}
	await db.delete(apikey).where(eq(apikey.userId, userId))
	await db.delete(users).where(eq(users.id, userId))
})

describe('GET /v1/app-settings photo flags', () => {
	it('reports uploads on and Photo to Item off when no AI provider is set up', async () => {
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/app-settings', { headers: { authorization: `Bearer ${key}` } }))
		expect(res.status).toBe(200)
		const body = (await res.json()) as { settings: { photoToItemEnabled: boolean; itemPhotoUploadsEnabled: boolean } }
		expect(body.settings.itemPhotoUploadsEnabled).toBe(true)
		expect(body.settings.photoToItemEnabled).toBe(false)
	})
})

describe('POST /v1/products/by-photo', () => {
	it('requires a bearer key', async () => {
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/products/by-photo', { method: 'POST' }))
		expect(res.status).toBe(401)
	})

	it('rejects a body with no file', async () => {
		const res = await post('/products/by-photo', new FormData())
		expect(res.status).toBe(400)
		expect(await errorCode(res)).toBe('invalid-input')
	})

	it('rejects a file that is not an image', async () => {
		const res = await post('/products/by-photo', multipart('not an image'))
		expect(res.status).toBe(400)
		expect(await errorCode(res)).toBe('invalid-image')
	})

	it('returns photo-to-item-disabled when no AI provider is set up', async () => {
		const res = await post('/products/by-photo', multipart(await tinyJpeg()))
		expect(res.status).toBe(503)
		expect(await errorCode(res)).toBe('photo-to-item-disabled')
	})
})

describe('POST /v1/items/:itemId/image', () => {
	it('stores the photo on the caller’s own item', async () => {
		const list = await makeList(db, { ownerId: userId })
		const item = await makeItem(db, { listId: list.id })

		const res = await post(`/items/${item.id}/image`, multipart(await tinyJpeg()))

		expect(res.status).toBe(200)
		const body = (await res.json()) as { url: string }
		expect(body.url.startsWith(`https://cdn.test/items/${item.id}/`)).toBe(true)
		const row = await db.query.items.findFirst({ where: eq(items.id, item.id), columns: { imageUrl: true } })
		expect(row?.imageUrl).toBe(body.url)
	})

	it('rejects a non-numeric item id', async () => {
		const res = await post('/items/abc/image', multipart(await tinyJpeg()))
		expect(res.status).toBe(400)
		expect(await errorCode(res)).toBe('invalid-id')
	})

	it('returns not-found for a missing item', async () => {
		const res = await post('/items/999999/image', multipart(await tinyJpeg()))
		expect(res.status).toBe(404)
		expect(await errorCode(res)).toBe('not-found')
	})

	it('rejects a file that is not an image', async () => {
		const list = await makeList(db, { ownerId: userId })
		const item = await makeItem(db, { listId: list.id })

		const res = await post(`/items/${item.id}/image`, multipart('not an image'))

		expect(res.status).toBe(400)
		expect(await errorCode(res)).toBe('invalid-image')
	})
})
