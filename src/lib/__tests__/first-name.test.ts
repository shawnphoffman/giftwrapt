import { describe, expect, it } from 'vitest'

import { safeFirstName } from '../first-name'

describe('safeFirstName', () => {
	it('takes the first word of a name', () => {
		expect(safeFirstName('Kate Marlowe', 'them')).toBe('Kate')
		expect(safeFirstName('  Jeff ', 'them')).toBe('Jeff')
	})

	it('never returns an email address or an empty string', () => {
		expect(safeFirstName('sam.private@example.test', 'them')).toBe('them')
		expect(safeFirstName('', 'them')).toBe('them')
		expect(safeFirstName(null, 'my friend')).toBe('my friend')
	})
})
