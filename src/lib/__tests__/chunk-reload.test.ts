import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { attemptChunkReload, isChunkLoadError } from '../chunk-reload'

function makeSessionStorage(): Storage {
	const map = new Map<string, string>()
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
		clear: () => map.clear(),
		key: (i: number) => [...map.keys()][i] ?? null,
		get length() {
			return map.size
		},
	}
}

describe('isChunkLoadError', () => {
	it('matches the per-browser dynamic-import failure messages', () => {
		expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(true)
		expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
		expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
	})

	it('matches a ChunkLoadError by name and string forms', () => {
		const err = new Error('boom')
		err.name = 'ChunkLoadError'
		expect(isChunkLoadError(err)).toBe(true)
		expect(isChunkLoadError('Loading chunk 5 failed')).toBe(true)
		expect(isChunkLoadError({ message: 'Loading CSS chunk failed' })).toBe(true)
	})

	it('ignores unrelated errors and non-error values', () => {
		expect(isChunkLoadError(new Error('TypeError: undefined is not a function'))).toBe(false)
		expect(isChunkLoadError(null)).toBe(false)
		expect(isChunkLoadError(undefined)).toBe(false)
		expect(isChunkLoadError(42)).toBe(false)
	})
})

describe('attemptChunkReload budget', () => {
	const reload = vi.fn()

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-06-22T00:00:00Z'))
		reload.mockClear()
		vi.stubGlobal('sessionStorage', makeSessionStorage())
		vi.stubGlobal('window', { location: { reload } })
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.useRealTimers()
	})

	it('reloads up to the cap within the window, then gives up', () => {
		// MAX_RELOADS is 5.
		for (let i = 0; i < 5; i++) {
			expect(attemptChunkReload()).toBe(true)
		}
		expect(reload).toHaveBeenCalledTimes(5)

		// 6th attempt within the window is denied so a broken deploy can't loop.
		expect(attemptChunkReload()).toBe(false)
		expect(reload).toHaveBeenCalledTimes(5)
	})

	it('resets the counter once the window elapses (fresh incident)', () => {
		for (let i = 0; i < 5; i++) attemptChunkReload()
		expect(attemptChunkReload()).toBe(false)

		// A later, unrelated stale-chunk incident gets its own budget.
		vi.advanceTimersByTime(30_001)
		expect(attemptChunkReload()).toBe(true)
		expect(reload).toHaveBeenCalledTimes(6)
	})
})
