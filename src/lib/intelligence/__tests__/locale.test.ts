import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { m } from '@/paraglide/messages.js'

// An analyzer runs from cron for someone who is not making a request, so
// there is no request locale to fall back on: every message it renders has
// to name the reader's locale (`m.key(params, { locale })`).

const root = join(__dirname, '..')
const analyzersDir = join(root, 'analyzers')
const files = [
	...readdirSync(analyzersDir)
		.filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
		.map(name => join(analyzersDir, name)),
	join(root, 'runner.ts'),
]

describe('message calls in the intelligence analyzers', () => {
	it('finds the analyzers', () => {
		expect(files.length).toBeGreaterThan(10)
	})

	for (const file of files) {
		it(`${file.slice(root.length + 1)} passes an explicit locale to every message`, () => {
			const source = readFileSync(file, 'utf8')
			// `m.intel_key(` and `m.intel_key.parts(`, up to the call's closing
			// paren. The options object is `o`, `{ locale }` or `{ locale: ... }`.
			const calls = source.match(/\bm\.intel_[a-z0-9_]+(?:\.parts)?\((?:[^()]|\([^()]*\))*\)/g) ?? []
			const missing = calls.filter(call => !/,\s*(?:o|\{\s*locale(?::[^{}]+)?\s*\})\s*\)$/.test(call))
			expect(missing).toEqual([])
		})
	}

	it('sees the calls it is checking', () => {
		const total = files.reduce((n, file) => n + (readFileSync(file, 'utf8').match(/\bm\.intel_[a-z0-9_]+/g) ?? []).length, 0)
		expect(total).toBeGreaterThan(100)
	})
})

describe('analyzer messages in each locale', () => {
	it('renders a plain sentence', () => {
		expect(m.intel_duplicates_title({}, { locale: 'en' })).toBe('Same item on two lists')
		expect(m.intel_duplicates_title({}, { locale: 'fr' })).toBe('Même article sur deux listes')
	})

	it('interpolates names without touching them', () => {
		expect(m.intel_stale_items_action_delete_confirm({ title: 'Scarf', listName: 'Wishes' }, { locale: 'en' })).toBe(
			'Permanently delete "Scarf" from Wishes? This cannot be undone.'
		)
		expect(m.intel_stale_items_action_delete_confirm({ title: 'Scarf', listName: 'Wishes' }, { locale: 'fr' })).toBe(
			'Supprimer définitivement « Scarf » de la liste « Wishes » ? Cette action est irréversible.'
		)
	})

	it('picks the singular and plural', () => {
		expect(m.intel_missing_price_title({ count: 1, listName: 'Wishes' }, { locale: 'en' })).toBe('Add a price to an item on Wishes')
		expect(m.intel_missing_price_title({ count: 2, listName: 'Wishes' }, { locale: 'en' })).toBe('Add prices to items on Wishes')
		expect(m.intel_missing_price_line({ count: 1, listName: 'Wishes' }, { locale: 'en' })).toBe('Wishes · 1 item missing a price')
		expect(m.intel_missing_price_line({ count: 2, listName: 'Wishes' }, { locale: 'en' })).toBe('Wishes · 2 items missing a price')
		expect(m.intel_missing_price_line({ count: 1, listName: 'Wishes' }, { locale: 'fr' })).toBe('Wishes · 1 article sans prix')
		expect(m.intel_missing_price_line({ count: 2, listName: 'Wishes' }, { locale: 'fr' })).toBe('Wishes · 2 articles sans prix')
	})

	it('counts the days to an event', () => {
		const params = { eventTitle: m.intel_common_event_birthday({}, { locale: 'en' }), listName: 'Wishes' }
		expect(m.intel_list_hygiene_primary_body({ ...params, count: 1 }, { locale: 'en' })).toBe(
			'Your Birthday is in 1 day but "Wishes" isn\'t your primary list. Making it primary means new items default into it.'
		)
		expect(m.intel_list_hygiene_primary_body({ ...params, count: 12 }, { locale: 'en' })).toBe(
			'Your Birthday is in 12 days but "Wishes" isn\'t your primary list. Making it primary means new items default into it.'
		)
		expect(
			m.intel_list_hygiene_primary_body(
				{ eventTitle: m.intel_common_event_birthday({}, { locale: 'fr' }), listName: 'Wishes', count: 12 },
				{ locale: 'fr' }
			)
		).toBe(
			'Anniversaire : plus que 12 jours, mais la liste « Wishes » n’est pas votre liste principale. En faire votre liste principale permet d’y ajouter les nouveaux articles par défaut.'
		)
	})
})
