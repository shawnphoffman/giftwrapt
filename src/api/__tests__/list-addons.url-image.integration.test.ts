// Off-list gifts carry an optional product URL + image (plan 18a). Covers
// persistence and normalization, mirror-on-save into the addon key space,
// storage cleanup when an image is replaced or the addon is deleted, and the
// read paths that surface the fields (list view, received gifts, purchases).

import { makeDependent, makeDependentGuardianship, makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createListAddonImpl, deleteListAddonImpl, updateListAddonImpl } from '@/api/_list-addons-impl'
import { getListAddonsImpl } from '@/api/_lists-impl'
import { getPurchaseSummaryImpl } from '@/api/_purchases-impl'
import { getReceivedGiftsImpl } from '@/api/received'
import { appSettings, listAddons } from '@/db/schema'
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

function makeFakeStorage(): StorageAdapter {
	return {
		upload: vi.fn(() => Promise.resolve()),
		delete: vi.fn(() => Promise.resolve()),
		stream: vi.fn(),
		list: vi.fn(),
		ready: vi.fn(),
		getPublicUrl: (key: string) => `https://cdn.test/${key}`,
	}
}

async function makeTinyPng(): Promise<Uint8Array> {
	const buf = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 200, b: 0 } } })
		.png()
		.toBuffer()
	return new Uint8Array(buf)
}

beforeEach(() => {
	_setStorageForTesting(makeFakeStorage())
})

afterEach(() => {
	_setStorageForTesting(undefined)
	vi.unstubAllGlobals()
	vi.mocked(cleanupImageUrls).mockClear()
})

describe('createListAddonImpl - url and image', () => {
	it('persists url and https-upgrades the image', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })

			const result = await createListAddonImpl({
				userId: gifter.id,
				input: {
					listId: list.id,
					description: 'Salad servers',
					totalCost: undefined,
					url: 'https://www.etsy.com/listing/1/salad-servers',
					imageUrl: 'http://img.example.com/servers.jpg',
				},
				dbx: tx,
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.addon.url).toBe('https://www.etsy.com/listing/1/salad-servers')
			expect(result.addon.imageUrl).toBe('https://img.example.com/servers.jpg')
		})
	})

	it('stores empty strings as null', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })

			const result = await createListAddonImpl({
				userId: gifter.id,
				input: { listId: list.id, description: 'Plain', totalCost: undefined, url: '', imageUrl: '' },
				dbx: tx,
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.addon.url).toBeNull()
			expect(result.addon.imageUrl).toBeNull()
		})
	})

	it('mirrors an external image into the addon key space when the toggle is on', async () => {
		await withRollback(async tx => {
			await tx.insert(appSettings).values({ key: 'mirrorExternalImagesOnSave', value: true })
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })

			const png = await makeTinyPng()
			vi.stubGlobal(
				'fetch',
				vi.fn(() => Promise.resolve(new Response(png as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } })))
			)

			const result = await createListAddonImpl({
				userId: gifter.id,
				input: { listId: list.id, description: 'Mirrored', totalCost: undefined, imageUrl: 'https://1.1.1.1/cool.png' },
				dbx: tx,
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.addon.imageUrl).toMatch(new RegExp(`^https://cdn\\.test/purchases/addon/${result.addon.id}/[0-9A-Za-z]+\\.webp$`))
		})
	})
})

describe('updateListAddonImpl - url and image', () => {
	it('sets, then clears, url and image', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id })

			const set = await updateListAddonImpl({
				userId: gifter.id,
				input: { addonId: addon.id, totalCost: undefined, url: 'https://example.com/p', imageUrl: 'https://example.com/p.jpg' },
				dbx: tx,
			})
			expect(set.kind).toBe('ok')
			if (set.kind !== 'ok') return
			expect(set.addon.url).toBe('https://example.com/p')
			expect(set.addon.imageUrl).toBe('https://example.com/p.jpg')

			const cleared = await updateListAddonImpl({
				userId: gifter.id,
				input: { addonId: addon.id, totalCost: undefined, url: null, imageUrl: null },
				dbx: tx,
			})
			expect(cleared.kind).toBe('ok')
			if (cleared.kind !== 'ok') return
			expect(cleared.addon.url).toBeNull()
			expect(cleared.addon.imageUrl).toBeNull()
		})
	})

	it('leaves url and image alone when the update omits them', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, {
				listId: list.id,
				userId: gifter.id,
				url: 'https://example.com/keep',
				imageUrl: 'https://cdn.test/purchases/addon/1/keepkeepkeep.webp',
			})

			await updateListAddonImpl({ userId: gifter.id, input: { addonId: addon.id, description: 'renamed', totalCost: undefined }, dbx: tx })

			const row = await tx.query.listAddons.findFirst({ where: eq(listAddons.id, addon.id) })
			expect(row?.url).toBe('https://example.com/keep')
			expect(row?.imageUrl).toBe('https://cdn.test/purchases/addon/1/keepkeepkeep.webp')
			expect(cleanupImageUrls).not.toHaveBeenCalled()
		})
	})

	it('cleans up the prior image when it is replaced', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const prior = 'https://cdn.test/purchases/addon/1/oldoldoldold.webp'
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id, imageUrl: prior })

			await updateListAddonImpl({
				userId: gifter.id,
				input: { addonId: addon.id, totalCost: undefined, imageUrl: 'https://example.com/new.jpg' },
				dbx: tx,
			})

			expect(cleanupImageUrls).toHaveBeenCalledWith([prior])
		})
	})

	it('does not clean up when the image is unchanged', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const same = 'https://cdn.test/purchases/addon/1/samesamesame.webp'
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id, imageUrl: same })

			await updateListAddonImpl({ userId: gifter.id, input: { addonId: addon.id, totalCost: undefined, imageUrl: same }, dbx: tx })

			expect(cleanupImageUrls).not.toHaveBeenCalled()
		})
	})
})

describe('deleteListAddonImpl - image cleanup', () => {
	it('cleans up the addon image on delete', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const image = 'https://cdn.test/purchases/addon/1/gonegonegone.webp'
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id, imageUrl: image })

			const result = await deleteListAddonImpl({ userId: gifter.id, input: { addonId: addon.id }, dbx: tx })

			expect(result.kind).toBe('ok')
			expect(cleanupImageUrls).toHaveBeenCalledWith([image])
		})
	})
})

describe('read paths surface url and image', () => {
	it('getListAddonsImpl returns url and imageUrl', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeListAddon(tx, { listId: list.id, userId: gifter.id, url: 'https://example.com/a', imageUrl: 'https://example.com/a.jpg' })

			const result = await getListAddonsImpl({ userId: gifter.id, listId: String(list.id), dbx: tx })

			expect(result?.addons[0]).toMatchObject({ url: 'https://example.com/a', imageUrl: 'https://example.com/a.jpg' })
		})
	})

	it("received gifts and purchases include a guardian-owner's addon on a dependent list", async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { name: 'Mochi', createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
			const list = await makeList(tx, { ownerId: guardian.id, subjectDependentId: dep.id })

			const created = await createListAddonImpl({
				userId: guardian.id,
				input: {
					listId: list.id,
					description: 'Salmon treats',
					totalCost: '12.00',
					url: 'https://example.com/treats',
					imageUrl: 'https://example.com/treats.jpg',
				},
				dbx: tx,
			})
			expect(created.kind).toBe('ok')
			if (created.kind !== 'ok') return

			// Purchases: the guardian gifted to their dependent, like a claim would.
			const summary = await getPurchaseSummaryImpl(guardian.id, tx)
			const purchase = summary.items.find(i => i.type === 'addon' && i.addonId === created.addon.id)
			expect(purchase).toMatchObject({ itemUrl: 'https://example.com/treats', recipientKind: 'dependent' })

			// Received: after reveal, it sits in the dependent's section.
			await tx.update(listAddons).set({ isArchived: true }).where(eq(listAddons.id, created.addon.id))
			const received = await getReceivedGiftsImpl({ userId: guardian.id, dbx: tx })
			const section = received.dependents.find(d => d.dependent.id === dep.id)
			expect(section?.addons).toHaveLength(1)
			expect(section?.addons[0]).toMatchObject({
				description: 'Salmon treats',
				url: 'https://example.com/treats',
				imageUrl: 'https://example.com/treats.jpg',
			})
		})
	})
})
