import { describe, expect, it } from 'vitest'

import { formatScopeLabel } from '../oauth-consent-page'

describe('formatScopeLabel', () => {
	it('humanizes the standard openid scope', () => {
		expect(formatScopeLabel('openid')).toBe('Confirm your identity')
	})

	it('humanizes the profile scope', () => {
		expect(formatScopeLabel('profile')).toBe('Read your name and avatar')
	})

	it('humanizes the email scope', () => {
		expect(formatScopeLabel('email')).toBe('Read your email address')
	})

	it('humanizes the offline_access scope', () => {
		expect(formatScopeLabel('offline_access')).toBe('Stay signed in (refresh tokens)')
	})

	it('falls back to a generic label for unknown scopes', () => {
		expect(formatScopeLabel('tasks:read')).toBe('Other access (tasks:read)')
		expect(formatScopeLabel('admin')).toBe('Other access (admin)')
	})
})
