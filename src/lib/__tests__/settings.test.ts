import { describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: {
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

import { appSettingsSchema, DEFAULT_APP_SETTINGS } from '@/lib/settings'

describe('appSettingsSchema', () => {
	it('partial.parse only returns the keys that were explicitly provided', () => {
		// Regression: previously each field carried `.default(...)`, so
		// `partial()` filled every absent field with its default and the
		// updateAppSettings upsert loop clobbered unrelated rows on each toggle.
		const parsed = appSettingsSchema.partial().parse({ enableBirthdayEmails: false })
		expect(parsed).toEqual({ enableBirthdayEmails: false })

		const both = appSettingsSchema.partial().parse({
			enableBirthdayEmails: false,
			enableCommentEmails: false,
		})
		expect(both).toEqual({
			enableBirthdayEmails: false,
			enableCommentEmails: false,
		})
	})

	it('parse(merged) still succeeds when every key comes from DEFAULT_APP_SETTINGS', () => {
		expect(() => appSettingsSchema.parse({ ...DEFAULT_APP_SETTINGS })).not.toThrow()
	})
})
