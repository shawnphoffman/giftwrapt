import { describe, expect, it } from 'vitest'

import { DEFAULT_APP_SETTINGS, toPublicAppSettings } from '@/lib/settings'

// Regression guard for the unauthenticated `fetchAppSettings` surface.
// `toPublicAppSettings` is the only thing standing between the decrypted
// settings object and the world; this test plants sentinel values in
// every secret slot and then walks the projected output for both the
// sentinels and any secret-shaped key that survived non-empty. A new
// secret field added to appSettingsSchema fails here loudly instead of
// leaking by default (the sec-review B1 bug: `oidcClient.clientSecret`
// was decrypted on read but never stripped from the public projection).

const SENTINEL = 'LEAKED_SECRET_SENTINEL'

// Keys that legitimately end in a secret-ish suffix but are not secrets.
// Empty on purpose; add entries deliberately, with a comment saying why
// the field is safe to expose to unauthenticated visitors.
const ALLOWED_SECRET_SHAPED_KEYS: ReadonlyArray<string> = []

const SECRET_KEY_SUFFIXES = ['secret', 'password', 'apikey', 'token', 'key']

function collectLeaves(value: unknown, path: string, out: Array<{ path: string; key: string; value: unknown }>): void {
	if (Array.isArray(value)) {
		value.forEach((entry, i) => collectLeaves(entry, `${path}[${i}]`, out))
		return
	}
	if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			const childPath = path ? `${path}.${key}` : key
			if (child && typeof child === 'object') {
				collectLeaves(child, childPath, out)
			} else {
				out.push({ path: childPath, key, value: child })
			}
		}
	}
}

function withPlantedSecrets(): typeof DEFAULT_APP_SETTINGS {
	return {
		...DEFAULT_APP_SETTINGS,
		scrapeProviders: [
			{ type: 'browserless', name: 'p1', endpoint: 'https://example.com', token: SENTINEL },
			{ type: 'scrapfly', name: 'p2', apiKey: SENTINEL },
		] as typeof DEFAULT_APP_SETTINGS.scrapeProviders,
		barcode: { ...DEFAULT_APP_SETTINGS.barcode, goUpcKey: SENTINEL },
		oidcClient: { ...DEFAULT_APP_SETTINGS.oidcClient, clientSecret: SENTINEL },
	}
}

describe('toPublicAppSettings', () => {
	it('strips every planted secret from the public projection', () => {
		const projected = toPublicAppSettings(withPlantedSecrets())
		expect(JSON.stringify(projected)).not.toContain(SENTINEL)
	})

	it('leaves no secret-shaped key with a non-empty value', () => {
		const projected = toPublicAppSettings(withPlantedSecrets())
		const leaves: Array<{ path: string; key: string; value: unknown }> = []
		collectLeaves(projected, '', leaves)
		const offenders = leaves.filter(({ key, value }) => {
			if (ALLOWED_SECRET_SHAPED_KEYS.includes(key)) return false
			const lower = key.toLowerCase()
			const secretShaped = SECRET_KEY_SUFFIXES.some(suffix => lower.endsWith(suffix))
			return secretShaped && typeof value === 'string' && value.length > 0
		})
		expect(offenders).toEqual([])
	})

	it('keeps non-secret capability fields readable', () => {
		const projected = toPublicAppSettings(withPlantedSecrets())
		expect(projected.oidcClient.enabled).toBe(DEFAULT_APP_SETTINGS.oidcClient.enabled)
		expect(projected.barcode.enabled).toBe(DEFAULT_APP_SETTINGS.barcode.enabled)
		expect(projected.scrapeProviders).toEqual([])
	})
})
