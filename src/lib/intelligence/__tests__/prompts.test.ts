import { describe, expect, it } from 'vitest'

import { buildDuplicatesPrompt, buildDuplicatesUserPrompt, DUPLICATES_SYSTEM, duplicatesResponseSchema } from '../prompts/duplicates'
import { buildGroupingPrompt, buildGroupingUserPrompt, GROUPING_SYSTEM, groupingResponseSchema } from '../prompts/grouping'
import { buildStaleItemsPrompt, buildStaleItemsUserPrompt, STALE_ITEMS_SYSTEM, staleItemsResponseSchema } from '../prompts/stale-items'

describe('stale-items prompt', () => {
	it('renders candidate ages grouped by list and never mentions claims/gifters', () => {
		const now = new Date('2026-05-01T00:00:00Z')
		const candidates = [
			{
				itemId: '1',
				title: 'Old kettle',
				listId: '10',
				listName: 'My Wishlist',
				listType: 'wishlist',
				updatedAt: new Date('2025-01-01T00:00:00Z'),
				availability: 'available' as const,
			},
			{
				itemId: '2',
				title: 'Old mug',
				listId: '11',
				listName: 'Birthday',
				listType: 'birthday',
				updatedAt: new Date('2024-06-01T00:00:00Z'),
				availability: 'available' as const,
			},
		]
		const out = buildStaleItemsPrompt({ candidates, now })
		expect(out).toContain('Old kettle')
		expect(out).toContain('My Wishlist')
		expect(out).toContain('Old mug')
		expect(out).toContain('Birthday')
		// listIds are echoed in the prompt so the model can reference them
		// in its grouped response.
		expect(out).toContain('id=10')
		expect(out).toContain('id=11')
		expect(out).toMatch(/lastEditedDays=\d+/)
		// Carries the protective instruction ("NEVER mention ...") so the
		// model knows not to invent claim/gifter context.
		expect(out).toMatch(/never mention.*claim/i)
	})

	it('separates the stable system block from the per-call user prompt', () => {
		const now = new Date('2026-05-01T00:00:00Z')
		const candidatesA = [
			{
				itemId: '1',
				title: 'Old kettle',
				listId: '10',
				listName: 'My Wishlist',
				listType: 'wishlist',
				updatedAt: new Date('2025-01-01T00:00:00Z'),
				availability: 'available' as const,
			},
		]
		const candidatesB = [
			{
				itemId: '2',
				title: 'Old mug',
				listId: '11',
				listName: 'Birthday',
				listType: 'birthday',
				updatedAt: new Date('2024-06-01T00:00:00Z'),
				availability: 'available' as const,
			},
		]
		// SYSTEM is stable: same bytes across users / runs / candidate sets.
		// That's the property prompt caching relies on.
		expect(STALE_ITEMS_SYSTEM).toMatch(/never mention.*claim/i)
		expect(STALE_ITEMS_SYSTEM).toMatch(/wishlist hygiene assistant/i)
		const userA = buildStaleItemsUserPrompt({ candidates: candidatesA, now })
		const userB = buildStaleItemsUserPrompt({ candidates: candidatesB, now })
		// User prompt holds only the variable content.
		expect(userA).toContain('Old kettle')
		expect(userA).not.toContain('Old mug')
		expect(userB).toContain('Old mug')
		expect(userB).not.toContain('Old kettle')
		// Legacy concatenation still works.
		expect(buildStaleItemsPrompt({ candidates: candidatesA, now })).toBe(`${STALE_ITEMS_SYSTEM}\n\n${userA}`)
	})

	it('parses a well-formed grouped model response', () => {
		const result = staleItemsResponseSchema.parse({
			lists: [
				{
					listId: '10',
					recs: [
						{
							include: true,
							severity: 'suggest',
							headline: 'Old',
							rationale: 'unused for a while',
							itemIds: ['100', '101'],
							intent: 'cleanup',
						},
					],
				},
				{ listId: '11', recs: [] },
			],
		})
		expect(result.lists).toHaveLength(2)
		expect(result.lists[0].recs).toHaveLength(1)
		expect(result.lists[0].recs[0].intent).toBe('cleanup')
	})

	it('accepts intent=pick-one for alternative-item recs', () => {
		const result = staleItemsResponseSchema.parse({
			lists: [
				{
					listId: '10',
					recs: [
						{
							include: true,
							severity: 'suggest',
							headline: 'Pick one',
							rationale: 'alternatives',
							itemIds: ['100', '101'],
							intent: 'pick-one',
						},
					],
				},
			],
		})
		expect(result.lists[0].recs[0].intent).toBe('pick-one')
	})

	it('SYSTEM prompt documents the intent field', () => {
		// The model needs an explicit cue about when pick-one vs. cleanup
		// applies; otherwise it'll default to cleanup and we lose the
		// "group as alternatives" framing entirely.
		expect(STALE_ITEMS_SYSTEM).toMatch(/intent/i)
		expect(STALE_ITEMS_SYSTEM).toMatch(/pick-one/i)
		expect(STALE_ITEMS_SYSTEM).toMatch(/cleanup/i)
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

	it('separates the stable system block from the per-call user prompt', () => {
		expect(DUPLICATES_SYSTEM).toMatch(/never mention.*claim/i)
		expect(DUPLICATES_SYSTEM).toMatch(/list hygiene assistant/i)
		const user = buildDuplicatesUserPrompt({
			candidatePairs: [
				[
					{ itemId: '1', title: 'Sony XM4', listId: '10', listName: 'Christmas', listType: 'christmas' },
					{ itemId: '2', title: 'Sony WH-1000XM4', listId: '11', listName: 'Birthday', listType: 'birthday' },
				],
			],
		})
		expect(user).toContain('Sony XM4')
		expect(user).not.toMatch(/list hygiene assistant/i)
		expect(buildDuplicatesPrompt({ candidatePairs: [] })).toBe(
			`${DUPLICATES_SYSTEM}\n\n${buildDuplicatesUserPrompt({ candidatePairs: [] })}`
		)
	})

	it('parses a well-formed model response', () => {
		const result = duplicatesResponseSchema.parse({
			pairs: [{ leftItemId: '1', rightItemId: '2', confident: true, rationale: 'same product' }],
		})
		expect(result.pairs).toHaveLength(1)
	})
})

describe('grouping prompt', () => {
	it('renders clusters with item ids, biases toward skip, and never mentions claims/gifters', () => {
		const out = buildGroupingPrompt({
			clusters: [
				{
					listId: '10',
					listName: 'Birthday 2026',
					items: [
						{ itemId: '1', title: 'Weber Spirit grill' },
						{ itemId: '2', title: 'Traeger Pro 575 grill' },
					],
				},
				{
					listId: '10',
					listName: 'Birthday 2026',
					items: [
						{ itemId: '3', title: 'PlayStation 5' },
						{ itemId: '4', title: 'PS5 DualSense controller (white)' },
						{ itemId: '5', title: 'PS5 DualSense controller (red)' },
					],
				},
			],
		})
		expect(out).toContain('Weber Spirit grill')
		expect(out).toContain('Traeger Pro 575 grill')
		expect(out).toContain('PlayStation 5')
		expect(out).toContain('id=1')
		expect(out).toContain('id=5')
		// Numbered cluster headers so the response can reference clusterIndex.
		expect(out).toContain('1. List "Birthday 2026":')
		expect(out).toContain('2. List "Birthday 2026":')
		// Bias toward "skip" + the protective instruction.
		expect(out).toMatch(/bias toward "skip"/i)
		expect(out).toMatch(/never mention.*claim/i)
		// Decision vocabulary present.
		expect(out).toContain('"or"')
		expect(out).toContain('"order"')
	})

	it('separates the stable system block from the per-call user prompt', () => {
		expect(GROUPING_SYSTEM).toMatch(/bias toward "skip"/i)
		expect(GROUPING_SYSTEM).toMatch(/never mention.*claim/i)
		const user = buildGroupingUserPrompt({
			clusters: [
				{
					listId: '10',
					listName: 'Birthday 2026',
					items: [{ itemId: '1', title: 'Weber Spirit grill' }],
				},
			],
		})
		expect(user).toContain('Weber Spirit grill')
		// The user-prompt block must NOT carry the instruction text; that's
		// the cacheable system block's job.
		expect(user).not.toMatch(/bias toward "skip"/i)
	})

	it('parses a well-formed grouping response', () => {
		const result = groupingResponseSchema.parse({
			groups: [
				{ clusterIndex: 1, decision: 'or', itemIds: ['1', '2'], rationale: 'two grills serving the same purpose' },
				{ clusterIndex: 2, decision: 'order', itemIds: ['3', '4', '5'], rationale: 'console first, then accessories' },
				{ clusterIndex: 3, decision: 'skip', itemIds: [], rationale: 'unrelated' },
			],
		})
		expect(result.groups).toHaveLength(3)
		expect(result.groups[0].decision).toBe('or')
		expect(result.groups[1].itemIds).toEqual(['3', '4', '5'])
	})
})
