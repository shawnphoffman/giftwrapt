import { describe, expect, it } from 'vitest'

import { renderTotpQrSvg, totpQrInputSchema } from '../totp-qr'

const VALID_TOTP_URI =
	'otpauth://totp/GiftWrapt:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GiftWrapt&algorithm=SHA1&digits=6&period=30'

describe('totpQrInputSchema', () => {
	it('accepts a valid otpauth:// URI', () => {
		expect(() => totpQrInputSchema.parse({ totpURI: VALID_TOTP_URI })).not.toThrow()
	})

	it('rejects a URI that does not start with otpauth://', () => {
		expect(() => totpQrInputSchema.parse({ totpURI: 'https://evil.example/totp' })).toThrow()
	})

	it('rejects an empty URI', () => {
		expect(() => totpQrInputSchema.parse({ totpURI: '' })).toThrow()
	})

	it('rejects a URI over the 2048-char cap', () => {
		const huge = `otpauth://totp/x?secret=${'A'.repeat(2050)}`
		expect(() => totpQrInputSchema.parse({ totpURI: huge })).toThrow()
	})

	it('rejects a missing totpURI key', () => {
		expect(() => totpQrInputSchema.parse({})).toThrow()
	})
})

describe('renderTotpQrSvg', () => {
	it('returns a valid SVG string for a standard otpauth URI', async () => {
		const { svg } = await renderTotpQrSvg({ totpURI: VALID_TOTP_URI })
		expect(svg).toMatch(/^<\?xml|^<svg/)
		expect(svg).toContain('<svg')
		expect(svg).toContain('</svg>')
	})

	it('includes the SVG xmlns attribute (required for inline + data-URI rendering)', async () => {
		const { svg } = await renderTotpQrSvg({ totpURI: VALID_TOTP_URI })
		expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
	})

	it('encodes the totpURI into the QR matrix (different URIs produce different SVGs)', async () => {
		const a = await renderTotpQrSvg({ totpURI: `${VALID_TOTP_URI}&label=a` })
		const b = await renderTotpQrSvg({ totpURI: `${VALID_TOTP_URI}&label=b` })
		expect(a.svg).not.toBe(b.svg)
	})

	it('is deterministic for the same input', async () => {
		const a = await renderTotpQrSvg({ totpURI: VALID_TOTP_URI })
		const b = await renderTotpQrSvg({ totpURI: VALID_TOTP_URI })
		expect(a.svg).toBe(b.svg)
	})

	it('produces output that round-trips through `encodeURIComponent` without breaking', async () => {
		const { svg } = await renderTotpQrSvg({ totpURI: VALID_TOTP_URI })
		const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
		expect(dataUri.length).toBeGreaterThan(svg.length)
		expect(decodeURIComponent(dataUri.slice('data:image/svg+xml;utf8,'.length))).toBe(svg)
	})
})
