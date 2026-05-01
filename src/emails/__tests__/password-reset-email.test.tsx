import { render } from '@react-email/components'
import { describe, expect, it } from 'vitest'

import PasswordResetEmail from '../password-reset-email'

// React's HTML renderer inserts `<!-- -->` separators between adjacent
// text segments — strip those (and html entities for apostrophes) so
// assertions can be written against the human-readable form.
const text = (html: string) => html.replace(/<!--\s*-->/g, '').replace(/&#x27;/g, "'")

describe('PasswordResetEmail', () => {
	it('renders the recipient name when provided', async () => {
		const html = await render(<PasswordResetEmail name="Alice" resetUrl="https://example.test/reset?token=abc" expiresInMinutes={60} />)
		expect(text(html)).toContain('Hi Alice')
		expect(html).toContain('https://example.test/reset?token=abc')
		expect(text(html)).toContain('60 minutes')
	})

	it("falls back to 'there' when no name is supplied", async () => {
		const html = await render(<PasswordResetEmail name={null} resetUrl="https://example.test/reset?token=abc" expiresInMinutes={30} />)
		expect(text(html)).toContain('Hi there')
		expect(text(html)).toContain('30 minutes')
	})

	it('includes the safety footer telling unintended recipients to ignore', async () => {
		const html = await render(<PasswordResetEmail name="Sam" resetUrl="https://example.test/reset?token=xyz" expiresInMinutes={45} />)
		expect(text(html).toLowerCase()).toContain("didn't request a password reset")
	})

	it('uses a clean string when name is whitespace-only', async () => {
		const html = await render(<PasswordResetEmail name="   " resetUrl="https://example.test/reset?token=abc" expiresInMinutes={10} />)
		expect(text(html)).toContain('Hi there')
	})
})
