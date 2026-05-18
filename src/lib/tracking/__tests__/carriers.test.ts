import { describe, expect, it } from 'vitest'

import { detectCarrier } from '../carriers'

describe('detectCarrier', () => {
	it('returns null for empty input', () => {
		expect(detectCarrier('').carrier).toBeNull()
		expect(detectCarrier('   ').carrier).toBeNull()
	})

	it('detects UPS 1Z numbers (uppercased, whitespace-stripped)', () => {
		const m = detectCarrier(' 1z999aa10123456784 ')
		expect(m.carrier).toBe('ups')
		expect(m.carrierName).toBe('UPS')
		expect(m.trackingUrl).toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784')
	})

	it('detects USPS letter-prefixed international labels', () => {
		const m = detectCarrier('CP123456789US')
		expect(m.carrier).toBe('usps')
		expect(m.trackingUrl).toContain('tools.usps.com')
		expect(m.trackingUrl).toContain('CP123456789US')
	})

	it('detects USPS IMpb numeric labels (22 digits, 94/93/92/95 prefix)', () => {
		const m = detectCarrier('9400111899223456789012')
		expect(m.carrier).toBe('usps')
	})

	it('detects FedEx 12-digit numbers', () => {
		const m = detectCarrier('123456789012')
		expect(m.carrier).toBe('fedex')
		expect(m.trackingUrl).toContain('fedex.com')
	})

	it('detects FedEx 15-digit numbers', () => {
		const m = detectCarrier('123456789012345')
		expect(m.carrier).toBe('fedex')
	})

	it('detects DHL 10-digit numbers', () => {
		const m = detectCarrier('1234567890')
		expect(m.carrier).toBe('dhl')
		expect(m.trackingUrl).toContain('dhl.com')
	})

	it('detects DHL 11-digit numbers', () => {
		const m = detectCarrier('12345678901')
		expect(m.carrier).toBe('dhl')
	})

	it('returns null for unrecognizable junk', () => {
		expect(detectCarrier('not a tracking number').carrier).toBeNull()
		expect(detectCarrier('123').carrier).toBeNull()
		expect(detectCarrier('!!!').carrier).toBeNull()
	})

	it('overlap: USPS 22-digit beats FedEx', () => {
		// 22 digits, 94 prefix - matches both the USPS prefix branch and would
		// match no FedEx pattern. Confirms ordering doesn't accidentally fire
		// FedEx for this length.
		expect(detectCarrier('9400111899223456789012').carrier).toBe('usps')
	})

	it('overlap: 12-digit numbers are FedEx, not DHL', () => {
		// DHL is 10 or 11; 12 must fall through to FedEx.
		expect(detectCarrier('123456789012').carrier).toBe('fedex')
	})

	it('returns plain-text fallback for partial UPS-looking strings', () => {
		expect(detectCarrier('1Z999AA1').carrier).toBeNull()
	})
})
