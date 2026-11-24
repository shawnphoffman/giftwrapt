import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EMBEDDED_UA_MARKER } from '@/lib/embedded'
import { getAppSettings } from '@/lib/settings-loader'

import { setOfferedLocalesForTesting } from '../locales'
import { getDefaultLocale, resetDefaultLocaleCache, resolveRequestLocale } from '../request-locale'

vi.mock('@/env', () => ({ env: { LOG_LEVEL: 'silent', LOG_PRETTY: false, BETTER_AUTH_SECRET: 'test-secret' } }))
vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/lib/settings-loader', () => ({ getAppSettings: vi.fn() }))

const loadSettings = vi.mocked(getAppSettings)

function settingsDefault(defaultLocale: string): void {
	loadSettings.mockResolvedValue({ defaultLocale } as Awaited<ReturnType<typeof getAppSettings>>)
}

function request(headers: Record<string, string> = {}): Request {
	return new Request('http://localhost/', { headers })
}

beforeEach(() => {
	loadSettings.mockReset()
	resetDefaultLocaleCache()
})

afterEach(() => setOfferedLocalesForTesting())

describe('resolveRequestLocale', () => {
	it.each(['en', 'fr'] as const)('never reads the default when %s is the only language offered', async only => {
		setOfferedLocalesForTesting([only])
		const visitors: Array<Record<string, string>> = [
			{},
			{ 'accept-language': 'de' },
			{ 'accept-language': 'fr,en;q=0.5' },
			{ cookie: 'gw-locale=en' },
		]
		for (const headers of visitors) {
			expect(await resolveRequestLocale(request(headers))).toBe(only)
		}
		expect(loadSettings).not.toHaveBeenCalled()
	})

	it('does not read the default when the cookie or the browser decides', async () => {
		setOfferedLocalesForTesting(['en', 'fr'])
		expect(await resolveRequestLocale(request({ cookie: 'gw-locale=fr', 'accept-language': 'en' }))).toBe('fr')
		expect(await resolveRequestLocale(request({ 'accept-language': 'fr-CA' }))).toBe('fr')
		expect(
			await resolveRequestLocale(
				request({ cookie: 'gw-locale=fr', 'accept-language': 'en', 'user-agent': `Mozilla/5.0 ${EMBEDDED_UA_MARKER}1.0` })
			)
		).toBe('en')
		expect(loadSettings).not.toHaveBeenCalled()
	})

	it('reads the default when neither the cookie nor the browser names an offered language', async () => {
		setOfferedLocalesForTesting(['en', 'fr'])
		settingsDefault('fr')
		expect(await resolveRequestLocale(request({ cookie: 'gw-locale=zz', 'accept-language': 'de' }))).toBe('fr')
		expect(loadSettings).toHaveBeenCalledTimes(1)
	})

	it('falls back to the first language offered when the default cannot be read, and tries again', async () => {
		setOfferedLocalesForTesting(['fr', 'en'])
		loadSettings.mockRejectedValueOnce(new Error('database down'))
		expect(await resolveRequestLocale(request())).toBe('fr')
		settingsDefault('en')
		expect(await resolveRequestLocale(request())).toBe('en')
	})
})

describe('the cached default', () => {
	it('is read again after a minute', async () => {
		setOfferedLocalesForTesting(['en', 'fr'])
		settingsDefault('en')
		expect(await getDefaultLocale(0)).toBe('en')
		settingsDefault('fr')
		expect(await getDefaultLocale(59_999)).toBe('en')
		expect(await getDefaultLocale(60_000)).toBe('fr')
	})

	it('is read again at once after a save clears it', async () => {
		setOfferedLocalesForTesting(['en', 'fr'])
		settingsDefault('en')
		expect(await getDefaultLocale(0)).toBe('en')
		settingsDefault('fr')
		resetDefaultLocaleCache()
		expect(await getDefaultLocale(1)).toBe('fr')
	})
})
