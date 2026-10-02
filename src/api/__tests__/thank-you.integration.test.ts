// Thank-you drafts: only revealed gifts of the caller's can be named, the
// prompt carries first names and titles and nothing about cost, and the
// feature is off by default.

import {
	makeDependent,
	makeDependentGuardianship,
	makeGiftedItem,
	makeItem,
	makeList,
	makeListAddon,
	makeUser,
} from '@test/integration/factories'
import { MockLanguageModelV3 } from 'ai/test'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import { aiUsage, appSettings, items, listAddons, users } from '@/db/schema'

let currentModel: MockLanguageModelV3
let aiValid = true

vi.mock('@/lib/ai-config', async () => ({
	...(await vi.importActual<Record<string, unknown>>('@/lib/ai-config')),
	resolveAiConfig: () =>
		Promise.resolve({
			isValid: aiValid,
			providerType: { source: 'env', value: 'anthropic' },
			baseUrl: { source: 'missing' },
			apiKey: { source: 'env', value: 'test-key' },
			model: { source: 'env', value: 'claude-haiku-4-5' },
			maxOutputTokens: { source: 'default', value: 4096 },
		}),
}))

vi.mock('@/lib/ai-client', () => ({ createAiModel: () => currentModel }))

import { draftThankYouImpl } from '@/api/_thank-you-impl'
import { getReceivedGiftsImpl } from '@/api/received'
import { _resetAiBudgetCacheForTesting } from '@/lib/ai-call'

type Captured = { prompt: string; calls: number }

function mockModel(text: string, captured: Captured): MockLanguageModelV3 {
	return new MockLanguageModelV3({
		modelId: 'claude-haiku-4-5',
		doGenerate: async args => {
			captured.calls += 1
			captured.prompt = JSON.stringify(args.prompt)
			return {
				content: [{ type: 'text' as const, text }],
				usage: {
					inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 60, text: 60, reasoning: 0 },
				},
				finishReason: { unified: 'stop' as const, raw: 'stop' },
				warnings: [],
			}
		},
	})
}

async function setSetting(key: string, value: unknown): Promise<void> {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

const createdUserIds: Array<string> = []

describe('thank-you drafts', () => {
	beforeEach(async () => {
		aiValid = true
		await setSetting('aiThankYouDraftsEnabled', true)
		_resetAiBudgetCacheForTesting()
	})
	afterEach(async () => {
		await db.delete(aiUsage)
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setSetting('aiThankYouDraftsEnabled', false)
	})

	async function seed() {
		const sam = await makeUser(db, { name: 'Sam Birchwood', email: 'sam.private@example.test' })
		const kate = await makeUser(db, { name: 'Kate Marlowe' })
		const zeb = await makeUser(db, { name: 'Zebulon Quince' })
		createdUserIds.push(sam.id, kate.id, zeb.id)
		const list = await makeList(db, { ownerId: sam.id, name: 'Sam Wishes', isPrimary: true })
		const scarf = await makeItem(db, { listId: list.id, title: 'Merino Scarf', price: '35' })
		const hidden = await makeItem(db, { listId: list.id, title: 'Unrevealed Surprise' })
		await makeGiftedItem(db, { itemId: scarf.id, gifterId: kate.id, totalCost: '987.65', notes: 'SECRET-CLAIM-NOTE' })
		await makeGiftedItem(db, { itemId: hidden.id, gifterId: zeb.id })
		const addon = await makeListAddon(db, { listId: list.id, userId: kate.id, description: 'Box of Chocolates', totalCost: '55.55' })
		// Reveal the scarf and the addon; the other claim stays hidden.
		await db.update(items).set({ isArchived: true, archivedAt: new Date() }).where(eq(items.id, scarf.id))
		await db.update(listAddons).set({ isArchived: true }).where(eq(listAddons.id, addon.id))
		const received = await getReceivedGiftsImpl({ userId: sam.id })
		const unitKey = received.gifts[0].gifterUnits[0].key
		return { sam, kate, zeb, scarf, hidden, addon, unitKey }
	}

	it('drafts from first names and revealed gift titles only', async () => {
		const { sam, scarf, addon, unitKey } = await seed()
		const captured: Captured = { prompt: '', calls: 0 }
		currentModel = mockModel('"Dear Kate, thank you for the scarf and the chocolates. https://example.com/made-up\n\nSam"', captured)

		const result = await draftThankYouImpl({
			actor: { id: sam.id },
			input: {
				unitKey,
				gifts: [
					{ type: 'item', id: scarf.id },
					{ type: 'addon', id: addon.id },
				],
			},
		})
		expect(result).toEqual({ kind: 'ok', note: 'Dear Kate, thank you for the scarf and the chocolates.\n\nSam' })

		expect(captured.prompt).toContain('From: Sam')
		expect(captured.prompt).toContain('To: Kate')
		expect(captured.prompt).toContain('Merino Scarf')
		expect(captured.prompt).toContain('Box of Chocolates')
		for (const secret of [
			'987.65',
			'55.55',
			'SECRET-CLAIM-NOTE',
			'Birchwood',
			'Marlowe',
			'sam.private',
			'Unrevealed Surprise',
			'Zebulon',
		]) {
			expect(captured.prompt, secret).not.toContain(secret)
		}
		expect(await db.select().from(aiUsage).where(eq(aiUsage.feature, 'thank-you-draft'))).toMatchObject([
			{ userId: sam.id, source: 'web', outcome: 'ok' },
		])
	})

	it('refuses an unrevealed gift, someone else’s gift, and a giver who did not give it', async () => {
		const { sam, kate, scarf, hidden, unitKey } = await seed()
		const captured: Captured = { prompt: '', calls: 0 }
		currentModel = mockModel('note', captured)

		// The claimed-but-unrevealed item is not on the Received page, so it cannot be named.
		expect(await draftThankYouImpl({ actor: { id: sam.id }, input: { unitKey, gifts: [{ type: 'item', id: hidden.id }] } })).toEqual({
			kind: 'error',
			reason: 'not-found',
		})
		// Mixing a real gift with one that is not revealed fails as a whole.
		expect(
			await draftThankYouImpl({
				actor: { id: sam.id },
				input: {
					unitKey,
					gifts: [
						{ type: 'item', id: scarf.id },
						{ type: 'item', id: hidden.id },
					],
				},
			})
		).toEqual({ kind: 'error', reason: 'not-found' })
		// Another user cannot draft against Sam's gifts.
		expect(await draftThankYouImpl({ actor: { id: kate.id }, input: { unitKey, gifts: [{ type: 'item', id: scarf.id }] } })).toEqual({
			kind: 'error',
			reason: 'not-found',
		})
		// A household that did not give the gift.
		expect(
			await draftThankYouImpl({ actor: { id: sam.id }, input: { unitKey: 'not-a-real-unit', gifts: [{ type: 'item', id: scarf.id }] } })
		).toEqual({ kind: 'error', reason: 'not-found' })
		expect(captured.calls).toBe(0)
	})

	it('writes on behalf of a dependent, and is off by default', async () => {
		const guardian = await makeUser(db, { name: 'Jordan Keeper' })
		const giver = await makeUser(db, { name: 'Robin Gale' })
		createdUserIds.push(guardian.id, giver.id)
		const fido = await makeDependent(db, { name: 'Fido', createdByUserId: guardian.id })
		await makeDependentGuardianship(db, { guardianUserId: guardian.id, dependentId: fido.id })
		const list = await makeList(db, { ownerId: guardian.id, name: 'Fido Wishes', subjectDependentId: fido.id })
		const toy = await makeItem(db, { listId: list.id, title: 'Chew Toy' })
		await makeGiftedItem(db, { itemId: toy.id, gifterId: giver.id })
		await db.update(items).set({ isArchived: true, archivedAt: new Date() }).where(eq(items.id, toy.id))
		const received = await getReceivedGiftsImpl({ userId: guardian.id })
		const unitKey = received.dependents[0].gifts[0].gifterUnits[0].key

		const captured: Captured = { prompt: '', calls: 0 }
		currentModel = mockModel('Dear Robin, thank you for the chew toy for Fido.\n\nJordan', captured)
		const input = { unitKey, gifts: [{ type: 'item' as const, id: toy.id }] }
		const result = await draftThankYouImpl({ actor: { id: guardian.id }, input })
		expect(result.kind).toBe('ok')
		expect(captured.prompt).toContain('The gifts were for: Fido')
		expect(captured.prompt).toContain('From: Jordan')

		aiValid = false
		expect(await draftThankYouImpl({ actor: { id: guardian.id }, input })).toEqual({ kind: 'error', reason: 'not-configured' })
		aiValid = true
		await setSetting('aiThankYouDraftsEnabled', false)
		expect(await draftThankYouImpl({ actor: { id: guardian.id }, input })).toEqual({ kind: 'error', reason: 'feature-disabled' })
		expect(captured.calls).toBe(1)
	})
})
