import { describe, expect, it, vi } from 'vitest'

import type { Database } from '@/db'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

// Mock both the AI config resolver (which would hit the DB) and the
// model client factory (which would build a real provider client). The
// test asserts the right model NAME flows into createAiModel for each
// analyzer.
vi.mock('@/lib/ai-config', () => ({
	resolveAiConfig: vi.fn(),
}))
vi.mock('@/lib/ai-client', () => ({
	createAiModel: vi.fn(),
}))

import { createAiModel } from '@/lib/ai-client'
import { resolveAiConfig } from '@/lib/ai-config'

import { resolveModelFactory } from '../runner'

const mockedResolve = vi.mocked(resolveAiConfig)
const mockedCreate = vi.mocked(createAiModel)

const fakeDb = {} as Database

function aiConfigOk() {
	return {
		isValid: true,
		providerType: { source: 'env' as const, value: 'anthropic' as const },
		apiKey: { source: 'env' as const, value: 'sk-test' },
		model: { source: 'env' as const, value: 'claude-default' },
		baseUrl: { source: 'missing' as const },
		maxOutputTokens: { source: 'default' as const, value: 4096 },
	}
}

describe('resolveModelFactory', () => {
	it('returns () => null when no AI provider is configured', async () => {
		mockedResolve.mockResolvedValue({
			...aiConfigOk(),
			isValid: false,
		})

		const factory = await resolveModelFactory(fakeDb, DEFAULT_APP_SETTINGS)
		expect(factory('duplicates')).toBeNull()
		expect(factory('stale-items')).toBeNull()
		expect(mockedCreate).not.toHaveBeenCalled()
	})

	it('uses the default model name when no overrides are set', async () => {
		mockedResolve.mockResolvedValue(aiConfigOk())
		mockedCreate.mockImplementation(args => ({ modelId: args.model }) as unknown as ReturnType<typeof createAiModel>)

		const factory = await resolveModelFactory(fakeDb, DEFAULT_APP_SETTINGS)
		const m = factory('duplicates')
		expect((m as { modelId: string }).modelId).toBe('claude-default')
	})

	it('falls back through the override hierarchy: per-analyzer beats global beats default', async () => {
		mockedResolve.mockResolvedValue(aiConfigOk())
		mockedCreate.mockImplementation(args => ({ modelId: args.model }) as unknown as ReturnType<typeof createAiModel>)

		const factory = await resolveModelFactory(fakeDb, {
			...DEFAULT_APP_SETTINGS,
			intelligenceModelOverride: 'claude-global-override',
			intelligenceAnalyzerModels: {
				duplicates: 'claude-haiku-cheap',
				'stale-items': 'claude-haiku-cheap',
			},
		})

		// Per-analyzer override wins for duplicates and stale-items.
		expect((factory('duplicates') as { modelId: string }).modelId).toBe('claude-haiku-cheap')
		expect((factory('stale-items') as { modelId: string }).modelId).toBe('claude-haiku-cheap')
		// Not overridden → falls back to the global override.
		expect((factory('grouping') as { modelId: string }).modelId).toBe('claude-global-override')
	})

	it('caches model instances by name so analyzers sharing an override share one client', async () => {
		mockedResolve.mockResolvedValue(aiConfigOk())
		mockedCreate.mockImplementation(args => ({ modelId: args.model }) as unknown as ReturnType<typeof createAiModel>)
		mockedCreate.mockClear()

		const factory = await resolveModelFactory(fakeDb, {
			...DEFAULT_APP_SETTINGS,
			intelligenceAnalyzerModels: {
				duplicates: 'claude-haiku-cheap',
				'stale-items': 'claude-haiku-cheap',
			},
		})

		const a = factory('duplicates')
		const b = factory('stale-items')
		const c = factory('grouping')

		// Two distinct names → two createAiModel calls. Repeated lookups
		// for the same name must return the SAME instance from cache.
		expect(mockedCreate).toHaveBeenCalledTimes(2)
		expect(a).toBe(b)
		expect(c).not.toBe(a)

		// Asking again doesn't re-create.
		factory('duplicates')
		expect(mockedCreate).toHaveBeenCalledTimes(2)
	})
})
