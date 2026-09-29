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
	const list = {
		listName: 'Birthday 2026',
		groups: [{ groupId: '7', type: 'or' as const, titles: ['Weber Spirit grill', 'Traeger Pro 575 grill'] }],
		items: [
			{ itemId: '1', title: 'Napoleon Rogue grill' },
			{ itemId: '3', title: 'PlayStation 5' },
			{ itemId: '4', title: 'PS5 DualSense controller (white)' },
		],
	}

	it('renders the list with existing groups and ungrouped item ids, and never mentions claims/gifters', () => {
		const out = buildGroupingPrompt(list)
		expect(out).toContain('List "Birthday 2026"')
		expect(out).toContain('group id=7 (or, pick one): "Weber Spirit grill"; "Traeger Pro 575 grill"')
		expect(out).toContain('"Napoleon Rogue grill" (id=1)')
		expect(out).toContain('"PS5 DualSense controller (white)" (id=4)')
		// Whole-group and multi-group instructions: the old prompt made
		// one decision per heuristic cluster and topped out at pairs.
		expect(out).toMatch(/include every ungrouped item that belongs/i)
		expect(out).toMatch(/several separate groups/i)
		expect(out).toMatch(/never mention.*claim/i)
		expect(out).toContain('"or"')
		expect(out).toContain('"order"')
		expect(out).toContain('"add"')
	})

	it('marks a list with no groups explicitly', () => {
		const out = buildGroupingUserPrompt({ ...list, groups: [] })
		expect(out).toContain('Existing groups:\n    (none)')
	})

	it('separates the stable system block from the per-call user prompt', () => {
		expect(GROUPING_SYSTEM).toMatch(/never mention.*claim/i)
		const user = buildGroupingUserPrompt(list)
		expect(user).toContain('Napoleon Rogue grill')
		// The user-prompt block must NOT carry the instruction text; that's
		// the cacheable system block's job.
		expect(user).not.toMatch(/never mention/i)
	})

	it('parses a well-formed grouping response', () => {
		const result = groupingResponseSchema.parse({
			suggestions: [
				{ action: 'add', groupType: 'or', groupId: '7', itemIds: ['1'], rationale: 'another grill for the same need' },
				{ action: 'new', groupType: 'order', groupId: '', itemIds: ['3', '4'], rationale: 'console first, then a controller' },
			],
		})
		expect(result.suggestions).toHaveLength(2)
		expect(result.suggestions[0].action).toBe('add')
		expect(result.suggestions[1].itemIds).toEqual(['3', '4'])
	})
})
