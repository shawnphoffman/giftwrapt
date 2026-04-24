import { describe, expect, it } from 'vitest'

import {
	availabilityEnumValues,
	birthMonthEnumValues,
	listTypeEnumValues,
	priorityEnumValues,
	roleEnumValues,
	statusEnumValues,
} from '../enums'

// Tripwire tests - if any of these drift, something in the schema changed
// that likely needs a coordinated migration + app-level update.
// Treat a failure here as "go read the diff and think," not "just update the test."
describe('schema enums', () => {
	it('list_type has all the supported values', () => {
		expect([...listTypeEnumValues]).toEqual(['wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test'])
	})

	it('availability has exactly available/unavailable', () => {
		expect([...availabilityEnumValues]).toEqual(['available', 'unavailable'])
	})

	it('status has exactly incomplete/complete', () => {
		expect([...statusEnumValues]).toEqual(['incomplete', 'complete'])
	})

	it('priority has exactly four tiers', () => {
		expect([...priorityEnumValues]).toEqual(['low', 'normal', 'high', 'very-high'])
	})

	it('role has exactly user/admin/child', () => {
		expect([...roleEnumValues]).toEqual(['user', 'admin', 'child'])
	})

	it('birth_month has all twelve months in order', () => {
		expect([...birthMonthEnumValues]).toEqual([
			'january',
			'february',
			'march',
			'april',
			'may',
			'june',
			'july',
			'august',
			'september',
			'october',
			'november',
			'december',
		])
	})
})
