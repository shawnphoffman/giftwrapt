import { describe, expect, it } from 'vitest'

import { resolveMismatchAction } from '../use-version-check'

const base = {
	embedded: true,
	trigger: 'visible',
	serverCommit: 'new',
	autoReloadedCommit: null,
	midTask: false,
} as const

describe('resolveMismatchAction', () => {
	it('always toasts in a plain browser tab', () => {
		expect(resolveMismatchAction({ ...base, embedded: false })).toBe('toast')
		expect(resolveMismatchAction({ ...base, embedded: false, trigger: 'mount' })).toBe('toast')
	})

	it('reloads the embedded shell on mount and when it comes back into view', () => {
		expect(resolveMismatchAction({ ...base, trigger: 'mount' })).toBe('reload')
		expect(resolveMismatchAction({ ...base, trigger: 'visible' })).toBe('reload')
	})

	it('does not reload under the user on the poll', () => {
		expect(resolveMismatchAction({ ...base, trigger: 'interval' })).toBe('toast')
	})

	it('does not reload over an open dialog or a focused field', () => {
		expect(resolveMismatchAction({ ...base, midTask: true })).toBe('toast')
	})

	it('reloads at most once per server commit', () => {
		expect(resolveMismatchAction({ ...base, autoReloadedCommit: 'new' })).toBe('toast')
		expect(resolveMismatchAction({ ...base, autoReloadedCommit: 'older' })).toBe('reload')
	})
})
