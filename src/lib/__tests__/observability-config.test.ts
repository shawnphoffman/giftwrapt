import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	env: { SENTRY_RELEASE: undefined as string | undefined },
	buildInfo: { commit: '' },
}))

vi.mock('@/env', () => ({ env: mocks.env }))
vi.mock('@/lib/build-info', () => ({ BUILD_INFO: mocks.buildInfo }))
vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/lib/settings-loader', () => ({ getAppSettings: vi.fn() }))

const { resolveSentryRelease } = await import('@/lib/observability/config')

beforeEach(() => {
	mocks.env.SENTRY_RELEASE = undefined
	mocks.buildInfo.commit = ''
})

describe('resolveSentryRelease', () => {
	it('prefers SENTRY_RELEASE', () => {
		mocks.env.SENTRY_RELEASE = 'v1.2.3'
		mocks.buildInfo.commit = 'a396095dbdd7ba2b08ea4551f4c190fd2fe6ac1a'
		expect(resolveSentryRelease()).toBe('v1.2.3')
	})

	it('falls back to the commit baked into the build', () => {
		mocks.buildInfo.commit = 'a396095dbdd7ba2b08ea4551f4c190fd2fe6ac1a'
		expect(resolveSentryRelease()).toBe('a396095dbdd7ba2b08ea4551f4c190fd2fe6ac1a')
	})

	it('is undefined when neither is known', () => {
		expect(resolveSentryRelease()).toBeUndefined()
	})
})
