import { describe, expect, it } from 'vitest'

import type { RecommendationAction } from '@/components/intelligence/__fixtures__/types'

import { coerceLegacyAction } from '../coerce-legacy-action'

describe('coerceLegacyAction', () => {
	it('rewrites the broken {listId: "settings"} shape to {path: "/settings/"}', () => {
		const action = {
			label: 'Open settings',
			description: 'Add people you shop for.',
			intent: 'do',
			nav: { listId: 'settings' },
		} as unknown as RecommendationAction
		const result = coerceLegacyAction(action, null)
		expect(result.nav).toEqual({ path: '/settings/' })
	})

	it('preserves a well-formed path nav', () => {
		const action: RecommendationAction = {
			label: 'Open settings',
			description: 'Add people you shop for.',
			intent: 'do',
			nav: { path: '/settings/' },
		}
		const result = coerceLegacyAction(action, null)
		expect(result.nav).toEqual({ path: '/settings/' })
	})

	it('preserves a well-formed list nav', () => {
		const action: RecommendationAction = {
			label: 'Open List',
			description: 'Go to the list.',
			intent: 'do',
			nav: { listId: 'list-1' },
		}
		const result = coerceLegacyAction(action, 'list-fallback')
		expect(result.nav).toEqual({ listId: 'list-1' })
	})

	it('parses the legacy `href: "/lists/..."` shape into a list nav', () => {
		const action = {
			label: 'Open List',
			description: 'Go to the list.',
			intent: 'do',
			href: '/lists/list-7',
		} as unknown as RecommendationAction
		const result = coerceLegacyAction(action, null)
		expect(result.nav).toEqual({ listId: 'list-7' })
		expect('href' in result).toBe(false)
	})

	it('parses the legacy href shape with item fragment into list+item nav', () => {
		const action = {
			label: 'Open item',
			description: 'Go to the item.',
			intent: 'do',
			href: '/lists/list-7#item-42',
		} as unknown as RecommendationAction
		const result = coerceLegacyAction(action, null)
		expect(result.nav).toEqual({ listId: 'list-7', itemId: '42' })
	})

	it('derives a list nav from the rec context for ancient `do` actions with no nav/href/apply', () => {
		const action: RecommendationAction = {
			label: 'Go',
			description: 'Do the thing.',
			intent: 'do',
		}
		const result = coerceLegacyAction(action, 'list-from-context')
		expect(result.nav).toEqual({ listId: 'list-from-context' })
	})

	it('leaves apply-actions untouched', () => {
		const action: RecommendationAction = {
			label: 'Set primary',
			description: 'Mark as primary list.',
			intent: 'do',
			apply: { kind: 'set-primary-list', listId: 'list-1' },
		}
		const result = coerceLegacyAction(action, null)
		expect(result).toBe(action)
	})

	it('leaves noop actions untouched even with no fallback list', () => {
		const action: RecommendationAction = {
			label: 'Keep both',
			description: 'Leave as-is.',
			intent: 'noop',
		}
		const result = coerceLegacyAction(action, null)
		expect(result.nav).toBeUndefined()
	})
})
