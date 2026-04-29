import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createItemImpl, updateItemImpl } from '@/api/items'
import { appSettings, items } from '@/db/schema'
import type * as EnvModule from '@/env'
import { _setStorageForTesting, type StorageAdapter } from '@/lib/storage/adapter'
import { cleanupImageUrls } from '@/lib/storage/cleanup'

import { makeList, makeUser } from '../../../test/integration/factories'
import { withRollback } from '../../../test/integration/setup'

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

async function makeTinyPng(): Promise<Uint8Array> {
	const buf = await sharp({
		create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 200, b: 0 } },
	})
		.png()
		.toBuffer()
	return new Uint8Array(buf)
}

afterEach(() => {
	_setStorageForTesting(undefined)
	vi.unstubAllGlobals()
	vi.mocked(cleanupImageUrls).mockClear()
})

describe('createItemImpl with mirror-on-save', () => {
	beforeEach(() => {
		_setStorageForTesting(makeFakeStorage())
	})

	it('preserves the original imageUrl when the toggle is off (default)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })

			const fetchSpy = vi.fn()
			vi.stubGlobal('fetch', fetchSpy)

			const result = await createItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'External', imageUrl: 'https://1.1.1.1/orig.png' },
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.item.imageUrl).toBe('https://1.1.1.1/orig.png')
			expect(fetchSpy).not.toHaveBeenCalled()
		})
	})

	it('mirrors the URL into storage and persists the storage URL when the toggle is on', async () => {
		await withRollback(async tx => {
			await tx.insert(appSettings).values({ key: 'mirrorExternalImagesOnSave', value: true })
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })

			const png = await makeTinyPng()
			vi.stubGlobal(
				'fetch',
				vi.fn(() => Promise.resolve(new Response(png as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } })))
			)

			const result = await createItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'External', imageUrl: 'https://1.1.1.1/cool.png' },
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.item.imageUrl).toMatch(/^https:\/\/cdn\.test\/items\/\d+\/[0-9A-Za-z]+\.webp$/)
		})
	})

	it('keeps the original URL when the mirror fetch fails', async () => {
		await withRollback(async tx => {
			await tx.insert(appSettings).values({ key: 'mirrorExternalImagesOnSave', value: true })
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })

			vi.stubGlobal(
				'fetch',
				vi.fn(() => Promise.reject(new Error('boom')))
			)

			const result = await createItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'External', imageUrl: 'https://1.1.1.1/broken.png' },
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.item.imageUrl).toBe('https://1.1.1.1/broken.png')
		})
	})

	it('skips mirror entirely when storage is not configured', async () => {
		await withRollback(async tx => {
			await tx.insert(appSettings).values({ key: 'mirrorExternalImagesOnSave', value: true })
			_setStorageForTesting(undefined)
			const envMod = await import('@/env')
			const original = envMod.env.STORAGE_BUCKET
			;(envMod.env as { STORAGE_BUCKET: string | undefined }).STORAGE_BUCKET = undefined
			try {
				const owner = await makeUser(tx)
				const list = await makeList(tx, { ownerId: owner.id })

				const fetchSpy = vi.fn()
				vi.stubGlobal('fetch', fetchSpy)

				const result = await createItemImpl({
					db: tx,
					actor: { id: owner.id },
					input: { listId: list.id, title: 'External', imageUrl: 'https://1.1.1.1/x.png' },
				})

				expect(result.kind).toBe('ok')
				if (result.kind !== 'ok') return
				expect(result.item.imageUrl).toBe('https://1.1.1.1/x.png')
				expect(fetchSpy).not.toHaveBeenCalled()
			} finally {
				;(envMod.env as { STORAGE_BUCKET: string | undefined }).STORAGE_BUCKET = original
			}
		})
	})
})

describe('updateItemImpl with mirror-on-save', () => {
	beforeEach(() => {
		_setStorageForTesting(makeFakeStorage())
	})

	it('mirrors a new external URL and schedules cleanup of the prior storage URL', async () => {
		await withRollback(async tx => {
			await tx.insert(appSettings).values({ key: 'mirrorExternalImagesOnSave', value: true })
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })

			const created = await createItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Original' },
			})
			expect(created.kind).toBe('ok')
			if (created.kind !== 'ok') return

			// Simulate a row that already points to a storage URL.
			const priorStorageUrl = `https://cdn.test/items/${created.item.id}/aaaaaaaaaa.webp`
			await tx.update(items).set({ imageUrl: priorStorageUrl }).where(eq(items.id, created.item.id))

			const png = await makeTinyPng()
			vi.stubGlobal(
				'fetch',
				vi.fn(() => Promise.resolve(new Response(png as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } })))
			)

			const result = await updateItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { itemId: created.item.id, imageUrl: 'https://1.1.1.1/replacement.png' },
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.item.imageUrl).toMatch(/^https:\/\/cdn\.test\/items\/\d+\/[0-9A-Za-z]+\.webp$/)
			expect(result.item.imageUrl).not.toBe(priorStorageUrl)
			expect(vi.mocked(cleanupImageUrls)).toHaveBeenCalledWith([priorStorageUrl])
		})
	})

	it('does not re-mirror when the new URL is already a storage URL (file-upload flow)', async () => {
		await withRollback(async tx => {
			await tx.insert(appSettings).values({ key: 'mirrorExternalImagesOnSave', value: true })
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })

			const created = await createItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Original' },
			})
			expect(created.kind).toBe('ok')
			if (created.kind !== 'ok') return

			const fetchSpy = vi.fn()
			vi.stubGlobal('fetch', fetchSpy)

			const storageUrl = 'https://cdn.test/items/99/abcdef0123.webp'
			const result = await updateItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { itemId: created.item.id, imageUrl: storageUrl },
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.item.imageUrl).toBe(storageUrl)
			expect(fetchSpy).not.toHaveBeenCalled()
		})
	})
})
