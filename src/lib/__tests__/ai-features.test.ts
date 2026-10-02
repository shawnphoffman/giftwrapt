import { describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({ env: { LOG_LEVEL: 'silent', LOG_PRETTY: false, BETTER_AUTH_SECRET: 'test-secret' } }))
vi.mock('@/db', () => ({ db: {} }))

import { AI_FEATURES } from '@/lib/ai-call'
import { AI_FEATURE_REGISTRY, AI_LEDGER_ONLY_FEATURES, AI_NON_FEATURE_SETTINGS } from '@/lib/ai-features'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

// A boolean setting named like an AI toggle: `ai…Enabled`, `…Ai…`, or an
// `intelligence…` switch.
function looksLikeAiToggle(key: string, value: unknown): boolean {
	if (typeof value !== 'boolean') return false
	return /^ai[A-Z]/u.test(key) || /[a-z]Ai[A-Z]/u.test(key) || /^intelligence.*(?:Enabled|WithAi)$/u.test(key)
}

describe('AI feature registry', () => {
	it('every AI toggle in the settings schema has a registry entry or a recorded reason', () => {
		const registered = new Set(AI_FEATURE_REGISTRY.map(f => f.settingKey).filter(Boolean))
		const unaccounted = Object.entries(DEFAULT_APP_SETTINGS)
			.filter(([key, value]) => looksLikeAiToggle(key, value))
			.map(([key]) => key)
			.filter(key => !registered.has(key as never) && !(key in AI_NON_FEATURE_SETTINGS))
		expect(unaccounted).toEqual([])
	})

	it('every feature label used on the usage ledger is described', () => {
		const described = new Set([...AI_FEATURE_REGISTRY.map(f => f.id), ...Object.keys(AI_LEDGER_ONLY_FEATURES)])
		expect(AI_FEATURES.filter(f => !described.has(f))).toEqual([])
		expect(AI_FEATURE_REGISTRY.map(f => f.id).filter(id => !(AI_FEATURES as ReadonlyArray<string>).includes(id))).toEqual([])
	})

	it('every entry says what is sent and what is never sent, and how it is switched', () => {
		for (const f of AI_FEATURE_REGISTRY) {
			expect(f.sent.length, f.id).toBeGreaterThan(0)
			expect(f.neverSent.length, f.id).toBeGreaterThan(0)
			expect(f.settingKey !== null || f.managedAt !== undefined, f.id).toBe(true)
			if (f.settingKey) expect(typeof DEFAULT_APP_SETTINGS[f.settingKey], f.id).toBe('boolean')
		}
	})

	it('every new AI feature defaults to off; the pre-existing photo flow keeps its behavior', () => {
		const onByDefault = AI_FEATURE_REGISTRY.filter(f => f.settingKey && DEFAULT_APP_SETTINGS[f.settingKey]).map(f => f.id)
		expect(onByDefault).toEqual(['photo-extract'])
	})
})
