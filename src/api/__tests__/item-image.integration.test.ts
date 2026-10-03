import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { uploadItemImageImpl } from '@/api/_item-image-impl'
import { items } from '@/db/schema'
import type * as EnvModule from '@/env'
import { _setStorageForTesting, type StorageAdapter } from '@/lib/storage/adapter'
import { cleanupImageUrls } from '@/lib/storage/cleanup'

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
	uploads: Array<{ key: string; contentType: string }>
}

function makeFakeStorage(): FakeStorage {
	const uploads: FakeStorage['uploads'] = []
	return {
		uploads,
		upload: vi.fn((key: string, _buffer: Buffer, contentType: string) => {
			uploads.push({ key, contentType })
			return Promise.resolve()
		}),
		delete: vi.fn(() => Promise.resolve()),
		stream: vi.fn(),
		list: vi.fn(),
		ready: vi.fn(),
		getPublicUrl: (key: string) => `https://cdn.test/${key}`,
	}
}

async function makeTinyJpeg(): Promise<Buffer> {
	return sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 0, b: 0 } } })
		.jpeg()
		.toBuffer()
}

afterEach(() => {
	_setStorageForTesting(undefined)
	vi.mocked(cleanupImageUrls).mockClear()
})

describe('uploadItemImageImpl', () => {
	it('stores the photo and points the item at it', async () => {
		const storage = makeFakeStorage()
		_setStorageForTesting(storage)
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			const result = await uploadItemImageImpl({ db: tx, userId: owner.id, itemId: item.id, bytes: await makeTinyJpeg() })

			expect(result.kind).toBe('ok')
			expect(storage.uploads).toHaveLength(1)
			expect(storage.uploads[0].key.startsWith(`items/${item.id}/`)).toBe(true)
			expect(storage.uploads[0].contentType).toBe('image/webp')
			const row = await tx.query.items.findFirst({ where: eq(items.id, item.id), columns: { imageUrl: true } })
			expect(row?.imageUrl).toBe(`https://cdn.test/${storage.uploads[0].key}`)
			if (result.kind === 'ok') expect(result.value.url).toBe(row?.imageUrl)
		})
	})

	it('deletes the image it replaces', async () => {
		const storage = makeFakeStorage()
		_setStorageForTesting(storage)
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, imageUrl: 'https://cdn.test/items/1/old.webp' })

			const result = await uploadItemImageImpl({ db: tx, userId: owner.id, itemId: item.id, bytes: await makeTinyJpeg() })

			expect(result.kind).toBe('ok')
			// The integration setup stubs cleanup; assert the call shape.
			expect(cleanupImageUrls).toHaveBeenCalledWith(['https://cdn.test/items/1/old.webp'])
		})
	})

	it('refuses a user who cannot edit the list', async () => {
		const storage = makeFakeStorage()
		_setStorageForTesting(storage)
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			const result = await uploadItemImageImpl({ db: tx, userId: stranger.id, itemId: item.id, bytes: await makeTinyJpeg() })

			expect(result).toMatchObject({ kind: 'error', reason: 'not-authorized' })
			expect(storage.uploads).toHaveLength(0)
		})
	})

	it('returns not-found for a missing item', async () => {
		_setStorageForTesting(makeFakeStorage())
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const result = await uploadItemImageImpl({ db: tx, userId: owner.id, itemId: 999_999, bytes: await makeTinyJpeg() })
			expect(result).toMatchObject({ kind: 'error', reason: 'not-found' })
		})
	})

	it('rejects bytes that are not an image', async () => {
		const storage = makeFakeStorage()
		_setStorageForTesting(storage)
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			const result = await uploadItemImageImpl({ db: tx, userId: owner.id, itemId: item.id, bytes: Buffer.from('not an image') })

			expect(result).toMatchObject({ kind: 'error', reason: 'bad-mime' })
			expect(storage.uploads).toHaveLength(0)
		})
	})
})
