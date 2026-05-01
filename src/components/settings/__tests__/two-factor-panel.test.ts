import { describe, expect, it } from 'vitest'

import { extractTotpSecret } from '../two-factor-panel'

describe('extractTotpSecret', () => {
	it('returns the secret in 4-char hyphenated chunks for a standard otpauth URI', () => {
		const uri = 'otpauth://totp/GiftWrapt:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GiftWrapt'
		expect(extractTotpSecret(uri)).toBe('JBSW-Y3DP-EHPK-3PXP')
	})

	it('uppercases lowercase secrets so they match what authenticators expect', () => {
		const uri = 'otpauth://totp/GiftWrapt:user@example.com?secret=jbswy3dpehpk3pxp'
		expect(extractTotpSecret(uri)).toBe('JBSW-Y3DP-EHPK-3PXP')
	})

	it('handles secrets that do not divide evenly into 4-char chunks', () => {
		const uri = 'otpauth://totp/GiftWrapt:user@example.com?secret=ABCDEF'
		expect(extractTotpSecret(uri)).toBe('ABCD-EF')
	})

	it('returns null when the URI has no secret param', () => {
		const uri = 'otpauth://totp/GiftWrapt:user@example.com?issuer=GiftWrapt'
		expect(extractTotpSecret(uri)).toBeNull()
	})

	it('returns null on a malformed URI', () => {
		expect(extractTotpSecret('not-a-url')).toBeNull()
	})

	it('strips whitespace inside the secret before chunking', () => {
		// Better-auth's encoder shouldn't produce whitespace, but be
		// defensive against authenticators that pre-format their output.
		const uri = 'otpauth://totp/GiftWrapt:user@example.com?secret=JBSW%20Y3DP'
		expect(extractTotpSecret(uri)).toBe('JBSW-Y3DP')
	})
})
