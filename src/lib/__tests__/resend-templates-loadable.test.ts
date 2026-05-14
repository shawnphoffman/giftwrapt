import { describe, expect, it } from 'vitest'

// Every email template that `@/lib/resend` lazy-imports inside a
// `sendXEmail` function. Keeping this list in lockstep with `resend.tsx`
// is the whole point of the test: if someone renames a template file or
// the wrong path is typed into a dynamic import, this fails fast at
// `pnpm test` time rather than at the moment a cron actually fires the
// email in production.
const TEMPLATE_PATHS = [
	'@/emails/happy-birthday-email',
	'@/emails/new-comment-email',
	'@/emails/orphan-claim-cleanup-reminder-email',
	'@/emails/orphan-claim-email',
	'@/emails/parents-day-reminder-email',
	'@/emails/partner-anniversary-reminder-email',
	'@/emails/password-reset-email',
	'@/emails/post-birthday-email',
	'@/emails/post-holiday-email',
	'@/emails/pre-birthday-reminder-email',
	'@/emails/pre-christmas-reminder-email',
	'@/emails/pre-custom-holiday-reminder-email',
	'@/emails/test-email',
	'@/emails/valentines-day-reminder-email',
] as const

describe('email templates resolve via dynamic import', () => {
	for (const path of TEMPLATE_PATHS) {
		it(`loads ${path}`, async () => {
			const mod = await import(/* @vite-ignore */ path)
			expect(typeof mod.default).toBe('function')
		})
	}
})
