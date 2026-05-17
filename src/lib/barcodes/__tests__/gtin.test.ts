import { describe, expect, it } from 'vitest'

import { normalizeGtin } from '../gtin'

describe('normalizeGtin', () => {
	it('accepts a valid UPC-A and pads to GTIN-14', () => {
		const r = normalizeGtin('012993441012')
		expect(r).toEqual({ ok: true, gtin14: '00012993441012' })
	})

	it('accepts a valid EAN-13', () => {
		// "The Hitchhiker's Guide to the Galaxy" - 9781400052929
		const r = normalizeGtin('9781400052929')
		expect(r).toEqual({ ok: true, gtin14: '09781400052929' })
	})

	it('accepts a valid GTIN-14 / ITF-14', () => {
		const r = normalizeGtin('10012345678902')
		expect(r).toEqual({ ok: true, gtin14: '10012345678902' })
	})

	it('accepts a valid EAN-8', () => {
		const r = normalizeGtin('73513537')
		expect(r).toEqual({ ok: true, gtin14: '00000073513537' })
	})

	it('expands a valid UPC-E to UPC-A and pads', () => {
		// UPC-E "01078903" -> UPC-A "010000007893" (last-digit rule 0):
		// d0=1,d1=0 → mfr = "100"+"00"; d2=7,d3=8,d4=9 → prod = "00"+"789".
		// Constructed so the EAN-8 short-circuit (left-pad to 14) fails
		// the mod-10 check and the code falls through to UPC-E expansion.
		const r = normalizeGtin('01078903')
		expect(r.ok).toBe(true)
		if (r.ok) expect(r.gtin14).toBe('00010000007893')
	})

	it('collapses leading-zero variants to the same GTIN-14', () => {
		const a = normalizeGtin('012993441012')
		const b = normalizeGtin('0012993441012')
		const c = normalizeGtin('00012993441012')
		expect(a.ok && b.ok && c.ok).toBe(true)
		if (a.ok && b.ok && c.ok) {
			expect(a.gtin14).toBe(b.gtin14)
			expect(b.gtin14).toBe(c.gtin14)
		}
	})

	it('trims whitespace', () => {
		const r = normalizeGtin('  012993441012  ')
		expect(r).toEqual({ ok: true, gtin14: '00012993441012' })
	})

	it('rejects non-numeric input', () => {
		expect(normalizeGtin('not-a-barcode')).toEqual({ ok: false, reason: 'invalid-code' })
		expect(normalizeGtin('01299344101a')).toEqual({ ok: false, reason: 'invalid-code' })
		expect(normalizeGtin('')).toEqual({ ok: false, reason: 'invalid-code' })
	})

	it('rejects an invalid mod-10 checksum', () => {
		// Off-by-one on the last digit.
		expect(normalizeGtin('012993441013')).toEqual({ ok: false, reason: 'invalid-code' })
		// Random misalignment - "012345678901" is a common bad example.
		expect(normalizeGtin('012345678901')).toEqual({ ok: false, reason: 'invalid-code' })
	})

	it('rejects unsupported lengths', () => {
		expect(normalizeGtin('12345')).toEqual({ ok: false, reason: 'invalid-code' })
		expect(normalizeGtin('1234567890')).toEqual({ ok: false, reason: 'invalid-code' })
		expect(normalizeGtin('123456789012345')).toEqual({ ok: false, reason: 'invalid-code' })
	})
})
