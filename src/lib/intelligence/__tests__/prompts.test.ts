import { describe, expect, it } from 'vitest'

import { buildDuplicatesPrompt, duplicatesResponseSchema } from '../prompts/duplicates'
import { buildStaleItemsPrompt, staleItemsResponseSchema } from '../prompts/stale-items'

describe('stale-items prompt', () => {
	it('renders candidate ages and never mentions claims/gifters', () => {
		const now = new Date('2026-05-01T00:00:00Z')
		const candidates = [
			{
				itemId: '1',
				title: 'Old kettle',
				listName: 'My Wishlist',
				listType: 'wishlist',
				updatedAt: new Date('2025-01-01T00:00:00Z'),
				availability: 'available' as const,
			},
		]
		const out = buildStaleItemsPrompt({ candidates, now })
		expect(out).toContain('Old kettle')
		expect(out).toContain('My Wishlist')
		expect(out).toMatch(/last edited \d+ days ago/)
		// Carries the protective instruction ("NEVER mention ...") so the
		// model knows not to invent claim/gifter context.
		expect(out).toMatch(/never mention.*claim/i)
	})

	it('parses a well-formed model response', () => {
		const result = staleItemsResponseSchema.parse({
			recs: [{ include: true, severity: 'suggest', headline: 'Old', rationale: 'unused for a while' }],
		})
		expect(result.recs).toHaveLength(1)
	})
})

describe('duplicates prompt', () => {
	it('renders pairs and never mentions claims/gifters', () => {
		const out = buildDuplicatesPrompt({
			candidatePairs: [
				[
					{ itemId: '1', title: 'Sony XM4', listId: '10', listName: 'Christmas', listType: 'christmas' },
					{ itemId: '2', title: 'Sony WH-1000XM4', listId: '11', listName: 'Birthday', listType: 'birthday' },
				],
			],
		})
		expect(out).toContain('Sony XM4')
		expect(out).toContain('Sony WH-1000XM4')
		expect(out).toMatch(/never mention.*claim/i)
	})

	it('parses a well-formed model response', () => {
		const result = duplicatesResponseSchema.parse({
			pairs: [{ leftItemId: '1', rightItemId: '2', confident: true, rationale: 'same product' }],
		})
		expect(result.pairs).toHaveLength(1)
	})
})
