import { describe, expect, it } from 'vitest'

import { buildContentSecurityPolicy } from '@/lib/csp'

function directive(csp: string, name: string): string | undefined {
	return csp.split('; ').find(d => d.startsWith(`${name} `))
}

describe('buildContentSecurityPolicy', () => {
	it('is the strict self-only policy with no env', () => {
		expect(buildContentSecurityPolicy({})).toBe(
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
		)
	})

	it('allows the Sentry DSN origin in connect-src only', () => {
		const csp = buildContentSecurityPolicy({ sentryDsn: 'https://abc123@o1.ingest.us.sentry.io/42' })
		expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://o1.ingest.us.sentry.io")
		expect(csp).not.toContain('abc123')
		expect(directive(csp, 'script-src')).toBe("script-src 'self' 'unsafe-inline'")
	})

	it('ignores a malformed DSN', () => {
		expect(directive(buildContentSecurityPolicy({ sentryDsn: 'not a url' }), 'connect-src')).toBe("connect-src 'self'")
	})

	it('allows the Vercel preview overlay only on preview deploys', () => {
		const preview = buildContentSecurityPolicy({ vercelEnv: 'preview' })
		expect(directive(preview, 'script-src')).toBe("script-src 'self' 'unsafe-inline' https://vercel.live")
		expect(directive(preview, 'connect-src')).toBe("connect-src 'self' https://vercel.live wss://ws-us3.pusher.com")
		expect(directive(preview, 'frame-src')).toBe('frame-src https://vercel.live')

		const production = buildContentSecurityPolicy({ vercelEnv: 'production' })
		expect(production).not.toContain('vercel.live')
		expect(directive(production, 'frame-src')).toBe("frame-src 'none'")
	})

	it('matches the policy hoffstuff.com served from the build-time config', () => {
		expect(
			buildContentSecurityPolicy({
				sentryDsn: 'https://59669dd25ba40a82bd86dc6d5e9a9f32@o508348.ingest.us.sentry.io/4511451407319040',
				vercelEnv: 'production',
			})
		).toBe(
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://o508348.ingest.us.sentry.io; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
		)
	})
})
